# Universal Site Video Grid

A single-file Python 3.11 crawler that discovers pages on a domain and generates a responsive HTML thumbnail grid report of videos, along with a JSON export of the collected metadata.

## Requirements

- Python 3.11
- Dependencies:
  - httpx
  - beautifulsoup4
  - lxml
  - playwright

## Setup

```bash
pip install httpx beautifulsoup4 lxml playwright
playwright install chromium
```

## Run

```bash
python universal_site_video_grid.py --base https://example.com --out report.html
```

## Interactive GUI

Launch the built-in GUI to enter a base URL, tweak crawl options, and start the crawl from a button.

```bash
python universal_site_video_grid.py --gui
```

### One-click GUI launcher

If you prefer a single-click run, use the bundled launcher script:

```bash
python launch_gui.py
```

On Windows, you can double-click the batch file:

```
launch_gui.bat
```

The batch launcher opens a console window so you can watch crawl progress logs.

### Common options

- `--max-pages 500` (default: 250)
- `--concurrency 6` (default: 6)
- `--delay 0.15` (default: 0.15 seconds)
- `--include-subdomains` (flag)
- `--use-playwright always|auto|never` (default: auto)
- `--max-depth 4` (default: 3)
- `--timeout 20` (default: 20 seconds)
- `--user-agent "UniversalVideoCrawler/1.0"`
- `--keywords "pricing,private beta"` (comma-separated keyword matches)
- `--include-keyword-matches` (include pages with keyword matches even without videos)
- `--keyword-filter-only` (skip pages without keyword matches for faster crawls)
- `--cache-file crawl_cache.json` (cache file for keyword hits/misses)
- `--use-cache` (enable cache for skipping known misses and reusing URL lists)
- `--use-cached-urls` (reuse cached URL list for a domain to “look again” quickly)
- `--skip-known-misses` (skip URLs that previously had no keyword matches)

### Example advanced runs

```bash
# Crawl more pages with heavier rendering
python universal_site_video_grid.py --base https://example.com --max-pages 500 --use-playwright always

# Be conservative with request rate
python universal_site_video_grid.py --base https://example.com --delay 0.5 --concurrency 2

# Include subdomains and follow links deeper when sitemaps are sparse
python universal_site_video_grid.py --base https://example.com --include-subdomains --max-depth 5

# Hunt for pages mentioning specific keywords
python universal_site_video_grid.py --base https://example.com --keywords "private beta,pricing" --include-keyword-matches

# Speed up by only keeping keyword matches
python universal_site_video_grid.py --base https://example.com --keywords "private beta,pricing" --keyword-filter-only

# Re-scan a domain using cached URLs while skipping known misses
python universal_site_video_grid.py --base https://example.com --keywords "private beta,pricing" --use-cache --use-cached-urls --skip-known-misses
```

## Output

- `report.html`: searchable, responsive thumbnail grid report
- `report.json`: raw results and stats in JSON format
