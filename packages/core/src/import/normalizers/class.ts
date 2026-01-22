import type { Class } from "../../types/entities";
import { entryToText, normalizeId, readString, readStringArray } from "./utils";
import type { NormalizeContext } from "../importTypes";

export const normalizeClass = (record: Record<string, unknown>, ctx: NormalizeContext): Class => {
  const name = readString(record.name) ?? "Unnamed Class";
  const source = readString(record.source) ?? ctx.sourceHint ?? "USER";
  const featuresText = entryToText(record.classFeatures ?? record.entries);
  const levels = Array.isArray(record.classFeatures)
    ? record.classFeatures.map((feature, index) => ({
        level: index + 1,
        features: [entryToText(feature)].filter(Boolean)
      }))
    : undefined;
  return {
    id: readString(record.id) ?? normalizeId("class", name, source),
    name,
    type: "class",
    source,
    description: featuresText,
    text: featuresText,
    entries: featuresText ? [featuresText] : [],
    hitDie: readString(record.hitDice) ?? readString(record.hd),
    primaryAbility: readStringArray(record.primaryAbility),
    proficiencies: readStringArray(record.proficiencies) ?? readStringArray(record.proficiency),
    levels,
    tags: ["class"],
    raw: ctx.storeRaw ? record : undefined
  };
};
