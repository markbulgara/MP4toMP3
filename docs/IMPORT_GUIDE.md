# Import Guide (5etools format)

AshBeyond supports 5etools-style JSON schema layouts. The importer detects entity categories by top-level keys.

## Supported Keys

- `spell`
- `item`
- `class`
- `subclass`
- `background`
- `feat`
- `race` or `species`

## How to Import

1. Go to **Settings → Content Sources**.
2. Under **Local Import**, select one or more JSON files.
3. The importer normalizes entries into AshBeyond’s canonical schema and stores them locally.

## Notes on Rendering

Entry text is treated as structured text and rendered as plain text to avoid unsafe HTML injection.
