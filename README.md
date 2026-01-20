# Katana Video Site Crawler

A Windows desktop application for running ProjectDiscovery Katana against a single video-site domain with safe defaults and an advanced configuration panel. The user provides only a target URL and clicks **Run Crawl**; the preset runs all required passes and merges results.

## Why PySide6
PySide6 (Qt) provides fast delivery for a native Windows desktop app. Packaging is handled with PyInstaller.

## Features
- One-click **Video Site Crawl** preset (URL discovery, metadata extraction, asset discovery, XHR discovery).
- Safe defaults: same-host scope, robots.txt respected, conservative concurrency/delay, max URLs, and max runtime.
- Results folder per run with normalized, deduplicated outputs.
- In-app results viewer with filters and exports to CSV/JSON.
- Katana auto-detection with the option to browse to a custom binary.

## Requirements
- Windows 10/11
- Python 3.10+ recommended
- ProjectDiscovery Katana installed and available on PATH (or choose the binary in Advanced settings)

### Install Katana
Follow the official instructions: https://github.com/projectdiscovery/katana

## Setup
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Run the App
```bash
python -m app.main
```

## Outputs
Each run creates a folder `run-YYYYMMDD-HHMMSS` under the output root (default: Documents/KatanaVideoCrawler/runs).

- `run.json`: run metadata, settings, totals, and katana version
- `urls.txt`: deduped list of discovered URLs
- `pages.jsonl`: one JSON per page with extracted metadata
- `assets.txt`: media assets (mp4/webm/m3u8)
- `xhr.jsonl`: XHR/Fetch endpoints with method and content type (when available)
- `summary.csv`: flattened summary for quick analysis
- `errors.log`: stderr from katana and app-level exceptions

## Advanced Settings
- Depth (default 5)
- Max URLs (default 50,000)
- Max runtime (default 1800 seconds)
- Timeout per request (default 15 seconds)
- Concurrency (default 5)
- Delay (default 0.2 seconds)
- Respect robots.txt (default ON)
- Same-host scope (default ON)
- Include patterns (optional)
- Asset extensions (default: mp4, webm, m3u8)
- Enable JS crawl / jsluice / XHR capture (default ON)
- Aggressive dedupe (optional)
- Custom katana args (append-only)
- Katana binary path override

## Build (Windows)
```powershell
.\scripts\build_windows.ps1
```
The packaged executable is produced in `dist/`.

## Tests
```bash
python -m unittest
```

## Usage Disclaimer
Use this tool only on systems you own or have explicit permission to test.
