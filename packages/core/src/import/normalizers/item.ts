import type { Item } from "../../types/entities";
import { entryToText, normalizeId, readNumber, readString, readStringArray } from "./utils";
import type { NormalizeContext } from "../importTypes";

export const normalizeItem = (record: Record<string, unknown>, ctx: NormalizeContext): Item => {
  const name = readString(record.name) ?? "Unnamed Item";
  const source = readString(record.source) ?? ctx.sourceHint ?? "USER";
  const description = entryToText(record.entries);
  const weight = readNumber(record.weight);
  const value = readString(record.value) ?? readNumber(record.value);
  const itemType = readString(record.type) ?? readString(record.itemType);
  const armor = record.armor && typeof record.armor === "object" ? record.armor : undefined;
  return {
    id: readString(record.id) ?? normalizeId("item", name, source),
    name,
    type: "item",
    source,
    description,
    text: description,
    entries: description ? [description] : [],
    itemType,
    rarity: readString(record.rarity),
    value,
    weight,
    weaponProps: readStringArray(record.weaponProps) ?? readStringArray(record.properties),
    armor: armor
      ? {
          acBase: readNumber((armor as Record<string, unknown>).ac) ?? 10,
          dexCap: readNumber((armor as Record<string, unknown>).dexCap),
          category: readString((armor as Record<string, unknown>).category)
        }
      : undefined,
    tags: ["item", itemType].filter(Boolean) as string[],
    raw: ctx.storeRaw ? record : undefined
  };
};
