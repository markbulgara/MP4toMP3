# MP4 to MP3 Converter

A simple local web app for converting MP4 videos into MP3 audio files using drag-and-drop.

## Requirements

- Python 3.9+
- ffmpeg installed and available on your PATH

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

### Optional: transcription + speaker labels

To generate transcripts (and optionally differentiate speakers), install the extra dependencies:

```bash
pip install -r requirements-transcribe.txt
```

For speaker labels, set a Hugging Face token for the diarization model:

```bash
export PYANNOTE_TOKEN=your_token_here
```

You can also change the Whisper model size with:

```bash
export WHISPER_MODEL=base
```

## Run

```bash
python app.py
```

Visit `http://localhost:5000` and drag/drop an MP4 file to convert it.
