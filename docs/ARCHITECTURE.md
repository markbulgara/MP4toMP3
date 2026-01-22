# AshBeyond Architecture

AshBeyond is a monorepo that delivers an offline-first compendium browser and character suite.

## Packages

- `apps/web`: Next.js App Router UI, Zustand state, Tailwind UI.
- `packages/core`: Types, provider registry, dice engine, rules helpers, IndexedDB storage.
- `packages/ui`: Reserved for shared UI components (optional for future expansion).

## Data Flow

1. Content providers implement `ContentProvider` in `packages/core`.
2. Providers normalize entities into canonical types and store them in IndexedDB.
3. The `ProviderRegistry` merges results across enabled providers and namespaces IDs as `providerId:entityId`.
4. The UI consumes registry results through Zustand stores and renders them in virtualized lists.

## Import Pipeline

The Import Data screen runs an ingestion pipeline that detects entity payloads, normalizes them, stores records in per-entity Dexie tables, and updates the search index incrementally.

## Offline-First

All installed content sources are cached in IndexedDB via Dexie. The remote provider is disabled by default; once enabled it caches fetched pages locally for offline access.

## Character System

The character builder writes records to IndexedDB. The character sheet reads those records and provides quick dice rolls with results pushed into the chat log.
