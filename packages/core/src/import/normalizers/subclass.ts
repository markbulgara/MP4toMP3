import type { Subclass } from "../../types/entities";
import { entryToText, normalizeId, readString } from "./utils";
import type { NormalizeContext } from "../importTypes";

export const normalizeSubclass = (record: Record<string, unknown>, ctx: NormalizeContext): Subclass => {
  const name = readString(record.name) ?? "Unnamed Subclass";
  const source = readString(record.source) ?? ctx.sourceHint ?? "USER";
  const featuresText = entryToText(record.subclassFeatures ?? record.entries);
  const levels = Array.isArray(record.subclassFeatures)
    ? record.subclassFeatures.map((feature, index) => ({
        level: index + 1,
        features: [entryToText(feature)].filter(Boolean)
      }))
    : undefined;
  return {
    id: readString(record.id) ?? normalizeId("subclass", name, source),
    name,
    type: "subclass",
    source,
    description: featuresText,
    text: featuresText,
    entries: featuresText ? [featuresText] : [],
    parentClassId: readString(record.className) ?? readString(record.classId),
    levels,
    tags: ["subclass"],
    raw: ctx.storeRaw ? record : undefined
  };
};
