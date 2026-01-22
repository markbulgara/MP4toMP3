import type { AnyEntity, EntityType } from "../types/entities";

const typeMap: Record<string, EntityType> = {
  spell: "spell",
  item: "item",
  class: "class",
  subclass: "subclass",
  background: "background",
  feat: "feat",
  race: "species",
  species: "species"
};

const toArray = (value: unknown) => (Array.isArray(value) ? value : []);

const entryToText = (entry: unknown): string => {
  if (typeof entry === "string") {
    return entry;
  }
  if (entry && typeof entry === "object") {
    if ("entries" in entry && Array.isArray((entry as { entries?: unknown }).entries)) {
      return (entry as { entries: unknown[] }).entries.map(entryToText).join(" ");
    }
    if ("name" in entry && typeof (entry as { name?: unknown }).name === "string") {
      return String((entry as { name: string }).name);
    }
  }
  return "";
};

export const normalizeEntity = (type: EntityType, raw: Record<string, unknown>): AnyEntity => {
  const id = String(raw.name ?? raw.id ?? raw._id ?? crypto.randomUUID());
  const name = String(raw.name ?? "Unnamed");
  const entries = toArray(raw.entries).map(entryToText).filter(Boolean);
  const description = entries.join(" ");
  const base = {
    id,
    name,
    type,
    source: typeof raw.source === "string" ? raw.source : undefined,
    description,
    entries
  };

  switch (type) {
    case "spell":
      return {
        ...base,
        type,
        level: Number(raw.level ?? 0),
        school: typeof raw.school === "string" ? raw.school : undefined,
        castingTime: typeof raw.time === "string" ? raw.time : undefined,
        range: typeof raw.range === "string" ? raw.range : undefined,
        duration: typeof raw.duration === "string" ? raw.duration : undefined,
        components: Array.isArray(raw.components) ? raw.components.join(", ") : undefined
      };
    case "item":
      return {
        ...base,
        type,
        rarity: typeof raw.rarity === "string" ? raw.rarity : undefined,
        weight: typeof raw.weight === "number" ? raw.weight : undefined,
        value: typeof raw.value === "string" ? raw.value : undefined
      };
    case "class":
      return {
        ...base,
        type,
        hitDie: typeof raw.hitDice === "string" ? raw.hitDice : undefined,
        primaryAbility: Array.isArray(raw.primaryAbility) ? raw.primaryAbility.map(String) : undefined
      };
    case "subclass":
      return {
        ...base,
        type,
        parentClassId: typeof raw.className === "string" ? raw.className : undefined
      };
    case "background":
      return {
        ...base,
        type,
        proficiencies: Array.isArray(raw.proficiencies) ? raw.proficiencies.map(String) : undefined
      };
    case "feat":
      return {
        ...base,
        type,
        prerequisites: Array.isArray(raw.prerequisite) ? raw.prerequisite.map(String) : undefined
      };
    case "species":
      return {
        ...base,
        type,
        speed: typeof raw.speed === "number" ? raw.speed : undefined
      };
    default:
      return base as AnyEntity;
  }
};

export const detectEntities = (data: Record<string, unknown>): Array<{ type: EntityType; entries: Record<string, unknown>[] }> => {
  return Object.entries(data)
    .map(([key, value]) => {
      const type = typeMap[key];
      if (!type || !Array.isArray(value)) {
        return null;
      }
      return { type, entries: value as Record<string, unknown>[] };
    })
    .filter((value): value is { type: EntityType; entries: Record<string, unknown>[] } => Boolean(value));
};
