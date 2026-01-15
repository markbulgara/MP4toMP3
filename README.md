# MP4toMP3

A near-universal video downloader that only needs a URL. This repo provides a small
Python CLI built on top of `yt-dlp`, which supports thousands of sites and direct
video links.

## Quick start

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

python downloader.py "https://example.com/video-page" --output-dir downloads
```

## Usage

```bash
python downloader.py <url> [--output-dir <path>] [--format <yt-dlp format>] [--audio-only]
```

### Examples

Download the best available video:

```bash
python downloader.py "https://example.com/video-page"
```

Download into a specific folder:

```bash
python downloader.py "https://example.com/video-page" --output-dir downloads
```

Download audio only:

```bash
python downloader.py "https://example.com/video-page" --audio-only
```

## Notes

- This uses `yt-dlp` under the hood. If a site requires authentication, pass cookies
  or headers via the `--cookies` or `--headers` options.
- Ensure you have the rights to download content from any URL you supply.
