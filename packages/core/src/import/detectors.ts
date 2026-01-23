import type { DetectedPayload } from "./importTypes";
import type { EntityType } from "../types/entities";

const keyMap: Record<string, EntityType> = {
  spell: "spell",
  spells: "spell",
  item: "item",
  items: "item",
  class: "class",
  classes: "class",
  subclass: "subclass",
  subclasses: "subclass",
  race: "species",
  races: "species",
  species: "species",
  background: "background",
  backgrounds: "background",
  feat: "feat",
  feats: "feat"
};

const wrapperKeys = ["data", "content", "records", "compendium"];

const unwrapPayload = (value: unknown): unknown => {
  if (!value || typeof value !== "object") {
    return value;
  }
  for (const key of wrapperKeys) {
    if (key in (value as Record<string, unknown>)) {
      return (value as Record<string, unknown>)[key];
    }
  }
  return value;
};

const detectByKeys = (json: Record<string, unknown>, fileName: string): DetectedPayload[] => {
  return Object.entries(json)
    .map(([key, value]) => {
      const mapped = keyMap[key];
      if (!mapped || !Array.isArray(value)) {
        return null;
      }
      return {
        entityType: mapped,
        records: value,
        sourceHint: typeof json.source === "string" ? json.source : undefined,
        confidence: 0.95,
        originalFileName: fileName
      } satisfies DetectedPayload;
    })
    .filter((value): value is DetectedPayload => Boolean(value));
};

const detectByArraySniff = (records: unknown[], fileName: string): DetectedPayload[] => {
  const sample = records.slice(0, 10).filter((item) => item && typeof item === "object") as Array<
    Record<string, unknown>
  >;
  if (sample.length === 0) {
    return [];
  }

  const score = (predicate: (record: Record<string, unknown>) => boolean) =>
    sample.reduce((sum, record) => sum + (predicate(record) ? 1 : 0), 0) / sample.length;

  const candidates: Array<{ type: EntityType; confidence: number }> = [
    {
      type: "spell",
      confidence: score(
        (record) => "level" in record && ("school" in record || "range" in record || "time" in record)
      )
    },
    {
      type: "item",
      confidence: score(
        (record) => "rarity" in record || "weight" in record || "value" in record || "type" in record
      )
    },
    {
      type: "class",
      confidence: score(
        (record) => "hitDice" in record || "hd" in record || "classFeatures" in record || "proficiency" in record
      )
    },
    {
      type: "subclass",
      confidence: score((record) => "className" in record || "subclassFeatures" in record)
    },
    {
      type: "species",
      confidence: score((record) => "speed" in record || "size" in record || "race" in record)
    },
    {
      type: "background",
      confidence: score((record) => "skillProficiencies" in record || "background" in record)
    },
    {
      type: "feat",
      confidence: score((record) => "prerequisite" in record || "prerequisites" in record)
    }
  ];

  return candidates
    .filter((candidate) => candidate.confidence >= 0.5)
    .map((candidate) => ({
      entityType: candidate.type,
      records,
      confidence: candidate.confidence,
      originalFileName: fileName
    }));
};

export const detectFilePayload = (json: unknown, fileName: string): DetectedPayload[] => {
  const unwrapped = unwrapPayload(json);
  if (Array.isArray(unwrapped)) {
    return detectByArraySniff(unwrapped, fileName);
  }
  if (unwrapped && typeof unwrapped === "object") {
    const payloads = detectByKeys(unwrapped as Record<string, unknown>, fileName);
    if (payloads.length > 0) {
      return payloads;
    }
    const nested = unwrapPayload(Object.values(unwrapped as Record<string, unknown>));
    if (Array.isArray(nested)) {
      return detectByArraySniff(nested, fileName);
    }
  }
  return [];
};
