import type { Species } from "../../types/entities";
import { entryToText, normalizeId, readNumber, readString, readStringArray } from "./utils";
import type { NormalizeContext } from "../importTypes";

export const normalizeSpecies = (record: Record<string, unknown>, ctx: NormalizeContext): Species => {
  const name = readString(record.name) ?? "Unnamed Species";
  const source = readString(record.source) ?? ctx.sourceHint ?? "USER";
  const featuresText = entryToText(record.entries);
  const speed = typeof record.speed === "number" || typeof record.speed === "object" ? record.speed : undefined;
  return {
    id: readString(record.id) ?? normalizeId("species", name, source),
    name,
    type: "species",
    source,
    description: featuresText,
    text: featuresText,
    entries: featuresText ? [featuresText] : [],
    size: readString(record.size) ?? readStringArray(record.size),
    speed: speed as Species["speed"],
    featuresText,
    abilityBonuses:
      record.abilityBonuses && typeof record.abilityBonuses === "object"
        ? (record.abilityBonuses as Record<string, number>)
        : undefined,
    tags: ["species"],
    raw: ctx.storeRaw ? record : undefined
  };
};
