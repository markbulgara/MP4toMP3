import type { Feat } from "../../types/entities";
import { entryToText, normalizeId, readString, readStringArray } from "./utils";
import type { NormalizeContext } from "../importTypes";

export const normalizeFeat = (record: Record<string, unknown>, ctx: NormalizeContext): Feat => {
  const name = readString(record.name) ?? "Unnamed Feat";
  const source = readString(record.source) ?? ctx.sourceHint ?? "USER";
  const featuresText = entryToText(record.entries);
  return {
    id: readString(record.id) ?? normalizeId("feat", name, source),
    name,
    type: "feat",
    source,
    description: featuresText,
    text: featuresText,
    entries: featuresText ? [featuresText] : [],
    prerequisites: readStringArray(record.prerequisite) ?? readStringArray(record.prerequisites),
    featuresText,
    tags: ["feat"],
    raw: ctx.storeRaw ? record : undefined
  };
};
