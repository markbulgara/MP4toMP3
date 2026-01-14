from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Optional

from flask import Flask, after_this_request, render_template, request, send_file
from werkzeug.utils import secure_filename

app = Flask(__name__)


@dataclass
class Session:
    token: str
    directory: str
    input_path: str
    created_at: float


SESSIONS: dict[str, Session] = {}
SESSION_TTL_SECONDS = 60 * 30


@dataclass
class Segment:
    start: float
    end: float
    speaker: str
    text: str


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def purge_sessions() -> None:
    now = time.time()
    expired_tokens = [
        token for token, session in SESSIONS.items() if now - session.created_at > SESSION_TTL_SECONDS
    ]
    for token in expired_tokens:
        session = SESSIONS.pop(token, None)
        if session:
            shutil.rmtree(session.directory, ignore_errors=True)


def whisper_available() -> bool:
    try:
        import whisper  # noqa: F401
    except ModuleNotFoundError:
        return False
    return True


def diarization_available() -> bool:
    try:
        from pyannote.audio import Pipeline  # noqa: F401
    except ModuleNotFoundError:
        return False
    return bool(os.getenv("PYANNOTE_TOKEN"))


def extract_audio(input_path: str, output_path: str) -> subprocess.CompletedProcess:
    command = [
        "ffmpeg",
        "-y",
        "-i",
        input_path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        output_path,
    ]
    return subprocess.run(command, capture_output=True, text=True)


def transcribe_audio(audio_path: str) -> list[dict]:
    import whisper

    model_name = os.getenv("WHISPER_MODEL", "base")
    model = whisper.load_model(model_name)
    result = model.transcribe(audio_path)
    return result.get("segments", [])


def diarize_audio(audio_path: str) -> list[tuple[float, float, str]]:
    from pyannote.audio import Pipeline

    token = os.getenv("PYANNOTE_TOKEN")
    if not token:
        return []

    pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=token)
    diarization = pipeline(audio_path)
    segments: list[tuple[float, float, str]] = []
    for segment, _, speaker in diarization.itertracks(yield_label=True):
        segments.append((segment.start, segment.end, speaker))
    return segments


def assign_speakers(
    whisper_segments: Iterable[dict],
    diarization_segments: Iterable[tuple[float, float, str]],
) -> List[Segment]:
    diarization_list = list(diarization_segments)
    results: List[Segment] = []

    for segment in whisper_segments:
        start = float(segment.get("start", 0.0))
        end = float(segment.get("end", 0.0))
        text = str(segment.get("text", "")).strip()

        best_speaker = "Speaker 1"
        best_overlap = 0.0
        for dia_start, dia_end, speaker in diarization_list:
            overlap = max(0.0, min(end, dia_end) - max(start, dia_start))
            if overlap > best_overlap:
                best_overlap = overlap
                best_speaker = speaker

        results.append(Segment(start=start, end=end, speaker=best_speaker, text=text))

    merged: List[Segment] = []
    for segment in results:
        if not merged:
            merged.append(segment)
            continue
        last = merged[-1]
        if segment.speaker == last.speaker and segment.start <= last.end + 0.15:
            last.end = segment.end
            last.text = f"{last.text} {segment.text}".strip()
        else:
            merged.append(segment)
    return merged


def store_session(temp_dir: str, input_path: str) -> Session:
    token = uuid.uuid4().hex
    session = Session(token=token, directory=temp_dir, input_path=input_path, created_at=time.time())
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
    return render_template(
        "index.html",
        ffmpeg_ready=ffmpeg_available(),
        whisper_ready=whisper_available(),
        diarization_ready=diarization_available(),
    )


@app.post("/convert")
def convert():
    if not ffmpeg_available():
        return {"error": "ffmpeg is not available on this system."}, 400

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
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return {"error": "Conversion failed.", "details": result.stderr}, 500

    return send_file(output_path, as_attachment=True, download_name=f"{base_name}.mp3")


@app.post("/transcribe")
def transcribe():
    if not ffmpeg_available():
        return {"error": "ffmpeg is not available on this system."}, 400

    if not whisper_available():
        return {
            "error": "Transcription is not available. Install openai-whisper to enable it.",
        }, 400

    file_info = require_file()
    if not file_info:
        return {"error": "No file was uploaded."}, 400
    upload, filename = file_info

    if not filename.lower().endswith(".mp4"):
        return {"error": "Only .mp4 files are supported."}, 400

    purge_sessions()
    temp_dir = tempfile.mkdtemp(prefix="mp4to3_")
    input_path = os.path.join(temp_dir, filename)
    audio_path = os.path.join(temp_dir, "audio.wav")
    upload.save(input_path)

    audio_result = extract_audio(input_path, audio_path)
    if audio_result.returncode != 0:
        shutil.rmtree(temp_dir, ignore_errors=True)
        return {"error": "Audio extraction failed.", "details": audio_result.stderr}, 500

    session = store_session(temp_dir, input_path)

    whisper_segments = transcribe_audio(audio_path)

    diarization_segments: list[tuple[float, float, str]] = []
    diarization_used = False
    if diarization_available():
        try:
            diarization_segments = diarize_audio(audio_path)
            diarization_used = bool(diarization_segments)
        except Exception:
            diarization_segments = []
            diarization_used = False

    segments = assign_speakers(whisper_segments, diarization_segments)

    return {
        "token": session.token,
        "segments": [
            {
                "start": segment.start,
                "end": segment.end,
                "speaker": segment.speaker,
                "text": segment.text,
            }
            for segment in segments
        ],
        "diarization": diarization_used,
    }


@app.post("/export")
def export():
    if not ffmpeg_available():
        return {"error": "ffmpeg is not available on this system."}, 400

    data = request.get_json(silent=True) or {}
    token = data.get("token")
    start = data.get("start")
    end = data.get("end")

    if not token or start is None or end is None:
        return {"error": "Missing export parameters."}, 400

    session = SESSIONS.get(token)
    if not session:
        return {"error": "Transcript session expired. Please transcribe again."}, 400

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

    @after_this_request
    def cleanup(response):
        session = SESSIONS.pop(token, None)
        if session:
            shutil.rmtree(session.directory, ignore_errors=True)
        return response

    return send_file(output_path, as_attachment=True, download_name="selection.mp3")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
