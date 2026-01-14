from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from flask import Flask, after_this_request, render_template, request, send_file
from werkzeug.utils import secure_filename

app = Flask(__name__)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


@app.get("/")
def index() -> str:
    return render_template("index.html", ffmpeg_ready=ffmpeg_available())


@app.post("/convert")
def convert():
    if not ffmpeg_available():
        return {"error": "ffmpeg is not available on this system."}, 400

    if "file" not in request.files:
        return {"error": "No file was uploaded."}, 400

    upload = request.files["file"]
    if upload.filename == "":
        return {"error": "Uploaded file has no name."}, 400

    filename = secure_filename(upload.filename)
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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
