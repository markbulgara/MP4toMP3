# Katana Indexer

Katana Indexer wraps the [ProjectDiscovery Katana](https://github.com/projectdiscovery/katana) crawler, enriches each URL with metadata, and stores everything in a fast SQLite search database (FTS5). Use it to surface hard-to-find video pages by searching tags, keywords, or descriptions.

## Requirements

- Go 1.21+
- `katana` CLI installed and on your `PATH`

## Quick start (Windows PowerShell)

```powershell
# Build (creates bin\katana-indexer.exe)
New-Item -ItemType Directory -Force -Path bin | Out-Null
go build -o bin\katana-indexer.exe .\cmd\katana-indexer

# Launch the all-in-one GUI (configure crawl, logs, progress, search)
# Then open http://localhost:8080 in your browser.
.\bin\katana-indexer.exe serve --addr :8080

# Or crawl directly from the CLI
# Crawl a domain (non-headless by default)
.\bin\katana-indexer.exe crawl --domain https://example.com --fetch-workers 128 --max-connections 512

# Crawl and start the search UI immediately
.\bin\katana-indexer.exe crawl --domain https://example.com --serve --serve-addr :8080

# Launch search UI
.\bin\katana-indexer.exe serve --addr :8080
```

Open `http://localhost:8080` and search by keywords/tags. Click any result to open the URL in your browser.

## First-time setup (step-by-step)

1. **Install Katana**: follow the Katana README to install the CLI and ensure it is on your `PATH`.
2. **Verify Go is installed**:
   ```powershell
   go version
   ```
3. **Build the binary**:
   ```powershell
   New-Item -ItemType Directory -Force -Path bin | Out-Null
   go build -o bin\katana-indexer.exe .\cmd\katana-indexer
   ```
4. **Run a crawl (only the domain is required)**:
   ```powershell
   .\bin\katana-indexer.exe crawl --domain https://example.com
   ```
   This auto-creates a local database at `./katana-index/example.com/index.db` (based on the domain).
5. **Start the search UI (GUI)**:
   ```powershell
   .\bin\katana-indexer.exe serve --addr :8080
   ```
6. **Open the GUI**: go to `http://localhost:8080` and search for keywords, tags, or descriptions.
7. **Want the UI immediately?** Run crawl with `--serve`:
   ```powershell
   .\bin\katana-indexer.exe crawl --domain https://example.com --serve --serve-addr :8080
   ```
8. **GUI-only flow**: run `serve`, then use the UI to start/stop crawls, watch logs, and load saved indexes.

> **Note (Windows)**: Katana runs non-headless and may prompt you to choose a browser the first time. Pick Chrome or Edge and set it as the default so the crawl continues without asking again.

## Performance notes

- Increase `--fetch-workers` and `--max-connections` to fully utilize fast CPUs and high bandwidth.
- Pass extra Katana tuning flags with `--katana-args`.
- Metadata fetches run in parallel and are limited to 2MB per page for speed.

## Troubleshooting build errors

If you see errors like **“missing go.sum entry”**, your Go module cache needs to download dependencies:

```powershell
go mod tidy
```

If that does not resolve it, run:

```powershell
go get github.com/mattn/go-sqlite3
go get golang.org/x/net/html
```

Then rebuild:

```powershell
go build -o bin\katana-indexer.exe .\cmd\katana-indexer
```

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
- `--serve`: Start the search UI while crawling.
- `--serve-addr`: Address for the search UI when `--serve` is enabled.

### `serve`

- `--db`: SQLite database path (auto-generated when empty).
- `--domain`: Domain or URL that was crawled (used to locate the database).
- `--addr`: Address to serve the UI.

## GUI features

The GUI provides:

- Domain, database path, and crawl settings input fields (including Katana args/path and User-Agent).
- Real-time logs and status counters.
- A progress bar based on indexed vs. metadata-fetched URLs.
- A **Stop & save** button to terminate early while keeping the current index.
- Load any previously saved database path to search past crawls.
