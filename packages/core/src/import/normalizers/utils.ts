import type { EntityType } from "../../types/entities";

export const cleanText = (value: string) =>
  value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const entryToText = (entry: unknown): string => {
  if (typeof entry === "string") {
    return cleanText(entry);
  }
  if (Array.isArray(entry)) {
    return entry.map(entryToText).filter(Boolean).join(" ");
  }
  if (entry && typeof entry === "object") {
    const record = entry as Record<string, unknown>;
    if ("entries" in record) {
      return entryToText(record.entries);
    }
    if ("items" in record) {
      return entryToText(record.items);
    }
    if ("name" in record && typeof record.name === "string") {
      return cleanText(record.name);
    }
    if ("text" in record && typeof record.text === "string") {
      return cleanText(record.text);
    }
  }
  return "";
};

export const normalizeId = (type: EntityType, name: string, source?: string) => {
  const base = `${type}-${name}-${source ?? "USER"}`.toLowerCase();
  return base.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
};

export const readString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const readNumber = (value: unknown) => (typeof value === "number" ? value : undefined);

export const readStringArray = (value: unknown) =>
  Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : undefined;
