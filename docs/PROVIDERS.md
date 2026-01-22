# Content Providers

AshBeyond is data-agnostic. The app does not ship rules content. All content is supplied by providers.

## Provider IDs

Every provider is identified by a stable `id`. Entity IDs are namespaced in the UI as `providerId:entityId` to prevent collisions.

## Built-in Providers

### Local Import Provider

- Upload one or more JSON files.
- The importer detects top-level keys (e.g., `spell`, `item`, `class`) and normalizes entries.
- Data is stored in IndexedDB and indexed for search.

### License Pack Provider

A license pack is a directory (or archive) containing:

- `licensepack.json` manifest
- Content JSON files listed by the manifest

`licensepack.json` example:

```json
{
  "id": "official-srd",
  "name": "Official SRD Pack",
  "version": "1.0.0",
  "files": ["spells.json", "items.json"]
}
```

### Remote Provider (optional)

The remote provider is disabled by default. Users must supply a base URL to a compatible endpoint. All responses are cached in IndexedDB for offline use.

Expected endpoints:

- `GET /entities/:type?page=0&pageSize=50`
- `GET /entities/:type/:id`
- `GET /search?q=fireball&page=0&pageSize=20`
