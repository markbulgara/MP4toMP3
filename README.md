# MP4 to MP3 Converter

A simple local web app for converting MP4 videos into MP3 audio files using drag-and-drop.

## Requirements

- Python 3.9+
- ffmpeg + ffprobe installed and available on your PATH

### Install ffmpeg

- macOS (Homebrew): `brew install ffmpeg`
- Ubuntu/Debian: `sudo apt-get install ffmpeg`
- Windows (Chocolatey): `choco install ffmpeg`

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Optional: auto-name exports from transcription

To auto-name exported selections based on the spoken content, install Whisper:

```bash
pip install -r requirements-transcribe.txt
```

You can change the Whisper model size with:

```bash
export WHISPER_MODEL=base
```

## Run

```bash
python app.py
```

Visit `http://localhost:5000` and drag/drop an MP4 file to convert it or generate a waveform for
range selection.
