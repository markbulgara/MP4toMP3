# Katana Indexer (Simple)

A minimal wrapper around [Katana](https://github.com/projectdiscovery/katana) that crawls a domain, stores page metadata in SQLite (FTS5), and lets you search metadata from the command line.

## Requirements

- Go 1.21+
- `katana` installed and available on your PATH
- SQLite built with FTS5 (use `-tags=sqlite_fts5` when building)

## Build (Windows PowerShell)

```powershell
$env:CGO_ENABLED=1
$env:GOFLAGS="-tags=sqlite_fts5"
go build -o bin\katana-indexer.exe .\cmd\katana-indexer
```

## Crawl

```powershell
.\bin\katana-indexer.exe crawl --domain https://example.com --db data\index.db
```

## Search

```powershell
.\bin\katana-indexer.exe search --db data\index.db --q "video download"
```

## Notes

- Metadata captured: title, description, keywords, content-type, status code.
- Use `--katana-path` if Katana is not on your PATH.
