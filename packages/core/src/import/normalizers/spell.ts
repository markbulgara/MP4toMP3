import type { Spell } from "../../types/entities";
import { entryToText, normalizeId, readNumber, readString, readStringArray } from "./utils";
import type { NormalizeContext } from "../importTypes";

export const normalizeSpell = (record: Record<string, unknown>, ctx: NormalizeContext): Spell => {
  const name = readString(record.name) ?? "Unnamed Spell";
  const source = readString(record.source) ?? ctx.sourceHint ?? "USER";
  const entriesText = entryToText(record.entries);
  return {
    id: readString(record.id) ?? normalizeId("spell", name, source),
    name,
    type: "spell",
    source,
    description: entriesText,
    text: entriesText,
    entries: entriesText ? [entriesText] : [],
    entriesText,
    level: readNumber(record.level) ?? 0,
    school: readString(record.school),
    castingTime: readString(record.time) ?? readString(record.castingTime),
    range: readString(record.range),
    duration: readString(record.duration),
    components: readString(record.components) ?? readStringArray(record.components)?.join(", "),
    classes: readStringArray(record.classes) ?? readStringArray(record.classList),
    tags: ["spell", readString(record.school)].filter(Boolean) as string[],
    raw: ctx.storeRaw ? record : undefined
  };
};
