import type { Background } from "../../types/entities";
import { entryToText, normalizeId, readString, readStringArray } from "./utils";
import type { NormalizeContext } from "../importTypes";

export const normalizeBackground = (record: Record<string, unknown>, ctx: NormalizeContext): Background => {
  const name = readString(record.name) ?? "Unnamed Background";
  const source = readString(record.source) ?? ctx.sourceHint ?? "USER";
  const featuresText = entryToText(record.entries);
  const proficiencies = readStringArray(record.proficiencies) ?? readStringArray(record.skillProficiencies);
  return {
    id: readString(record.id) ?? normalizeId("background", name, source),
    name,
    type: "background",
    source,
    description: featuresText,
    text: featuresText,
    entries: featuresText ? [featuresText] : [],
    proficiencies,
    featuresText,
    proficienciesText: proficiencies?.join(", "),
    tags: ["background"],
    raw: ctx.storeRaw ? record : undefined
  };
};
