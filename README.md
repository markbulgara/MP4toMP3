# MP4toMP3 Crawler

Windows-first crawler optimized for high-throughput discovery and indexing of large domains.

## Solution layout
- `CrawlerCore` – core crawler pipeline, dedupe, and SQLite store.
- `CrawlerApp.Wpf` – WPF GUI.
- `CrawlerCore.Tests` – unit tests for normalization, extraction, bloom filter, and database batching.

## Build
```bash
dotnet restore
```

```bash
dotnet publish CrawlerApp.Wpf -c Release -r win-x64
```

## Run a crawl
1. Launch `CrawlerApp.Wpf`.
2. Paste a target URL.
3. Click **Start**.

The crawler writes a SQLite database per run under `%LOCALAPPDATA%\CrawlerApp\<timestamp>\crawl.db`.

## Search
Use the **Pages** tab search box to query SQLite FTS5. The **Assets** tab uses a LIKE filter for quick asset lookups.

## Performance tuning
- **High throughput**: increase `GlobalConcurrency`, `PerHostConcurrency`, and batch sizes in `CrawlSettings`.
- **Robots**: disable `RespectRobots` for private/internal crawls only.
- **Response caps**: keep `MaxResponseBytes` between 2–5 MB.
- **Queues**: adjust `FrontierCapacity`, `FetchCapacity`, and `ParseCapacity` to tune backpressure.

## Safety defaults
- Same-host only scope.
- Robots.txt honored.
- Bounded memory via capped queues and a Bloom filter + SQLite seen store.

## Export
Exports should be run off the UI thread. Use SQLite CLI or write a small export tool against `crawl.db`.
