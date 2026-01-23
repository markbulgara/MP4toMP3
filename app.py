from __future__ import annotations

import base64
import os
import shutil
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from re import sub
from typing import Optional

from flask import Flask, after_this_request, render_template, request, send_file
from werkzeug.utils import secure_filename

app = Flask(__name__)


@dataclass
class Session:
    token: str
    directory: str
    input_path: str
    preview_path: str
    created_at: float
    duration: float


SESSIONS: dict[str, Session] = {}
SESSION_TTL_SECONDS = 60 * 30


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def whisper_available() -> bool:
    try:
        import whisper  # noqa: F401
    except ModuleNotFoundError:
        return False
    return True


def purge_sessions() -> None:
    now = time.time()
    expired_tokens = [
        token for token, session in SESSIONS.items() if now - session.created_at > SESSION_TTL_SECONDS
    ]
    for token in expired_tokens:
        session = SESSIONS.pop(token, None)
        if session:
            shutil.rmtree(session.directory, ignore_errors=True)


def ffprobe_duration(input_path: str) -> float:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nokey=1:noprint_wrappers=1",
        input_path,
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except ValueError:
        return 0.0


def generate_waveform(input_path: str, output_path: str) -> subprocess.CompletedProcess:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-filter_complex",
        "aformat=channel_layouts=mono,showwavespic=s=1200x240:colors=38bdf8",
        "-frames:v",
        "1",
        output_path,
    ]
    return subprocess.run(command, capture_output=True, text=True)


def extract_audio(input_path: str, output_path: str) -> subprocess.CompletedProcess:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "2",
        output_path,
    ]
    return subprocess.run(command, capture_output=True, text=True)


def transcribe_audio(input_path: str) -> str:
    import whisper

    model_name = os.getenv("WHISPER_MODEL", "base")
    model = whisper.load_model(model_name)
    result = model.transcribe(input_path)
    return str(result.get("text", "")).strip()


def generate_transcript_filename(text: str) -> str:
    cleaned = sub(r"[^a-zA-Z0-9\\s-]", "", text).strip().lower()
    cleaned = sub(r"\\s+", "_", cleaned)
    cleaned = cleaned[:80] or "selection"
    return secure_filename(cleaned) or "selection"


def store_session(temp_dir: str, input_path: str, preview_path: str, duration: float) -> Session:
    token = uuid.uuid4().hex
    session = Session(
        token=token,
        directory=temp_dir,
        input_path=input_path,
        preview_path=preview_path,
        created_at=time.time(),
        duration=duration,
    )
    SESSIONS[token] = session
    return session


def require_file() -> Optional[tuple[object, str]]:
    if "file" not in request.files:
        return None
    upload = request.files["file"]
    if upload.filename == "":
        return None
    filename = secure_filename(upload.filename)
    return upload, filename


@app.get("/")
def index() -> str:
    return render_template("index.html", ffmpeg_ready=ffmpeg_available())


@app.post("/convert")
def convert():
    if not ffmpeg_available():
        return {"error": "ffmpeg/ffprobe is not available on this system."}, 400

    file_info = require_file()
    if not file_info:
        return {"error": "No file was uploaded."}, 400
    upload, filename = file_info

    if not filename.lower().endswith(".mp4"):
        return {"error": "Only .mp4 files are supported."}, 400

    temp_dir = tempfile.mkdtemp(prefix="mp4to3_")
    input_path = os.path.join(temp_dir, filename)
    base_name = Path(filename).stem or "audio"
    output_path = os.path.join(temp_dir, f"{base_name}.mp3")
    upload.save(input_path)

    @after_this_request
    def cleanup(response):
        shutil.rmtree(temp_dir, ignore_errors=True)
        return response

    result = extract_audio(input_path, output_path)
    if result.returncode != 0:
        return {"error": "Conversion failed.", "details": result.stderr}, 500

    return send_file(output_path, as_attachment=True, download_name=f"{base_name}.mp3")


@app.post("/waveform")
def waveform():
    if not ffmpeg_available():
        return {"error": "ffmpeg/ffprobe is not available on this system."}, 400

    file_info = require_file()
    if not file_info:
        return {"error": "No file was uploaded."}, 400
    upload, filename = file_info

    if not filename.lower().endswith(".mp4"):
        return {"error": "Only .mp4 files are supported."}, 400

    purge_sessions()
    temp_dir = tempfile.mkdtemp(prefix="mp4to3_")
    input_path = os.path.join(temp_dir, filename)
    waveform_path = os.path.join(temp_dir, "waveform.png")
    preview_path = os.path.join(temp_dir, "preview.mp3")
    upload.save(input_path)

    duration = ffprobe_duration(input_path)
    waveform_result = generate_waveform(input_path, waveform_path)
    if waveform_result.returncode != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return {"error": "Waveform generation failed.", "details": waveform_result.stderr}, 500

    preview_result = extract_audio(input_path, preview_path)
    if preview_result.returncode != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return {"error": "Preview audio failed.", "details": preview_result.stderr}, 500

    session = store_session(temp_dir, input_path, preview_path, duration)

    with open(waveform_path, "rb") as image_file:
        encoded = base64.b64encode(image_file.read()).decode("utf-8")

    return {
        "token": session.token,
        "duration": session.duration,
        "waveform": f"data:image/png;base64,{encoded}",
        "preview_url": f"/preview/{session.token}",
    }


@app.post("/export")
def export():
    if not ffmpeg_available():
        return {"error": "ffmpeg/ffprobe is not available on this system."}, 400

    data = request.get_json(silent=True) or {}
    token = data.get("token")
    start = data.get("start")
    end = data.get("end")

    if not token or start is None or end is None:
        return {"error": "Missing export parameters."}, 400

    session = SESSIONS.get(token)
    if not session:
        return {"error": "Waveform session expired. Please upload again."}, 400

    pad_before = max(0.0, float(data.get("pad_before", 0.0)))
    pad_after = max(0.0, float(data.get("pad_after", 0.0)))

    start_time = max(0.0, float(start) - pad_before)
    end_time = max(float(end) + pad_after, start_time)
    duration = max(0.0, end_time - start_time)

    output_path = os.path.join(session.directory, "selection.mp3")
    command = [
        "ffmpeg",
        "-y",
        "-ss",
        f"{start_time:.3f}",
        "-i",
        session.input_path,
        "-t",
        f"{duration:.3f}",
        "-vn",
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "2",
        output_path,
    ]

    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return {"error": "Export failed.", "details": result.stderr}, 500

    download_name = "selection.mp3"
    if whisper_available():
        try:
            transcript = transcribe_audio(output_path)
            if transcript:
                safe_name = generate_transcript_filename(transcript)
                download_name = f"{safe_name}.mp3"
        except Exception:
            download_name = "selection.mp3"

    @after_this_request
    def cleanup(response):
        session = SESSIONS.pop(token, None)
        if session:
            shutil.rmtree(session.directory, ignore_errors=True)
        return response

    return send_file(output_path, as_attachment=True, download_name=download_name)


@app.get("/preview/<token>")
def preview(token: str):
    session = SESSIONS.get(token)
    if not session:
        return {"error": "Waveform session expired. Please upload again."}, 400
    return send_file(session.preview_path, mimetype="audio/mpeg")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
