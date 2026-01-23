# Import Guide

AshBeyond supports 5etools-style JSON schema layouts and other common pack formats. The importer detects entity categories, normalizes them to canonical types, and stores them in IndexedDB for offline use.

## Supported Keys

- `spell` / `spells`
- `item` / `items`
- `class` / `classes`
- `subclass` / `subclasses`
- `background` / `backgrounds`
- `feat` / `feats`
- `race` / `races` / `species`

## How to Import

1. Go to **Settings → Import Data**.
2. Drag and drop JSON files (or use the file picker to select multiple files or a folder).
3. Choose import options (overwrite, merge collisions, skip unknown types).
4. Start the import and review the summary report.

## Notes on Rendering

Entry text is treated as untrusted content and sanitized into plain text for safe display and search indexing.
