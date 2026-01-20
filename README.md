# Katana Indexer (Simple)

A minimal wrapper around [Katana](https://github.com/projectdiscovery/katana) that crawls a domain, stores URL metadata in SQLite, and lets you search by URL/title (no full page indexing).

## Requirements

- Go 1.21+
- `katana` installed and available on your PATH
- SQLite built with FTS5 (use `-tags=sqlite_fts5` when building)

## Build (Windows PowerShell)

```powershell
$env:CGO_ENABLED=1
$env:GOFLAGS="-tags=sqlite_fts5"
go mod tidy
go build -o bin\katana-indexer.exe .\cmd\katana-indexer
```

## Crawl

Basic crawl with Katana:

```powershell
.\bin\katana-indexer.exe crawl --domain https://example.com --db data\index.db
```

SPA fallback using sitemap/robots:

```powershell
.\bin\katana-indexer.exe crawl --domain https://example.com --use-robots --use-sitemap --db data\index.db
```

Seeding known entrypoints:

```powershell
.\bin\katana-indexer.exe crawl --domain https://example.com --seed-url https://example.com/#/spells --seed-file seeds.txt --db data\index.db
```

## Search (CLI)

```powershell
.\bin\katana-indexer.exe search --db data\index.db --q "video download"
```

## Serve (Web UI)

```powershell
.\bin\katana-indexer.exe serve --db data\index.db --addr :8080
```

Open `http://localhost:8080` and search by URL or title.

## Notes

- URL inventory metadata: URL, first/last seen, source, status, content-type, title, bytes, fetched_at.
- Sources include: katana, robots, sitemap, seed-file, seed-url.
- Use `--katana-path` if Katana is not on your PATH.
