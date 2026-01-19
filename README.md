# Katana Indexer

Katana Indexer wraps the [ProjectDiscovery Katana](https://github.com/projectdiscovery/katana) crawler, enriches each URL with metadata, and stores everything in a fast SQLite search database (FTS5). Use it to surface hard-to-find video pages by searching tags, keywords, or descriptions.

## Requirements

- Go 1.21+
- `katana` CLI installed and on your `PATH`

## Quick start

```bash
# Build
mkdir -p bin

go build -o bin/katana-indexer ./cmd/katana-indexer

# Crawl a domain (non-headless by default)
./bin/katana-indexer crawl --domain https://example.com \
  --fetch-workers 128 --max-connections 512

# Launch search UI
./bin/katana-indexer serve --domain https://example.com --addr :8080
```

Open `http://localhost:8080` and search by keywords/tags. Click any result to open the URL in your browser.

## Performance notes

- Increase `--fetch-workers` and `--max-connections` to fully utilize fast CPUs and high bandwidth.
- Pass extra Katana tuning flags with `--katana-args`.
- Metadata fetches run in parallel and are limited to 2MB per page for speed.

## Flags

### `crawl`

- `--domain`: Domain or URL to crawl (required).
- `--db`: SQLite database path (auto-generated when empty).
- `--katana-path`: Path to the Katana binary.
- `--katana-args`: Extra arguments passed directly to Katana.
- `--fetch-workers`: Parallel metadata fetch workers.
- `--timeout`: Timeout per metadata request.
- `--user-agent`: Custom User-Agent for metadata requests.
- `--max-connections`: Max metadata fetch connections.

### `serve`

- `--db`: SQLite database path (auto-generated when empty).
- `--domain`: Domain or URL that was crawled (used to locate the database).
- `--addr`: Address to serve the UI.
