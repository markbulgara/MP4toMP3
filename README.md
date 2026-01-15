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

Download a site that requires a Referer or User-Agent:

```bash
python downloader.py "https://www.1shows.nl/movies/1242898-predator-badlands?streaming=true" \
  --referer "https://www.1shows.nl/movies/1242898-predator-badlands?streaming=true" \
  --user-agent "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
```

## Notes

- This uses `yt-dlp` under the hood. If a site requires authentication, pass cookies
  or headers via the `--cookies`, `--header`, `--referer`, or `--user-agent` options.
- If `yt-dlp` reports an unsupported URL, the tool will attempt a lightweight HTML
  scrape to locate direct `.m3u8` or `.mp4` links and retry with the first match.
- Ensure you have the rights to download content from any URL you supply.
