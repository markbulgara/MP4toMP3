# Data Shapes

AshBeyond normalizes imported data into canonical entity types. Each record includes:

- `id` (string)
- `name` (string)
- `source` (string, default `USER`)
- `text` (plain text summary for search)
- `tags` (array of strings)

## Spell

```json
{
  "id": "spell-fireball-user",
  "name": "Fireball",
  "type": "spell",
  "source": "USER",
  "level": 3,
  "school": "Evocation",
  "castingTime": "1 action",
  "range": "150 feet",
  "components": "V, S, M",
  "duration": "Instantaneous",
  "classes": ["Wizard", "Sorcerer"],
  "entriesText": "A bright streak flashes..."
}
```

## Item

```json
{
  "id": "item-longsword-user",
  "name": "Longsword",
  "type": "item",
  "source": "USER",
  "itemType": "Weapon",
  "rarity": "Common",
  "value": "15 gp",
  "weight": 3,
  "weaponProps": ["versatile"],
  "armor": { "acBase": 16, "dexCap": 2, "category": "Medium" }
}
```

## Species

```json
{
  "id": "species-elf-user",
  "name": "Elf",
  "type": "species",
  "source": "USER",
  "size": "Medium",
  "speed": 30,
  "featuresText": "Keen Senses..."
}
```

## Class / Subclass

```json
{
  "id": "class-wizard-user",
  "name": "Wizard",
  "type": "class",
  "hitDie": "1d6",
  "primaryAbility": ["Intelligence"],
  "levels": [{ "level": 1, "features": ["Spellcasting"] }]
}
```

## Background / Feat

```json
{
  "id": "background-sage-user",
  "name": "Sage",
  "type": "background",
  "featuresText": "Researcher...",
  "proficienciesText": "Arcana, History"
}
```
