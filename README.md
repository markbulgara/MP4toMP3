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
```

## Output

- `report.html`: searchable, responsive thumbnail grid report
- `report.json`: raw results and stats in JSON format
