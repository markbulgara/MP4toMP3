import type { DetectedPayload, NormalizeContext, NormalizedBatch } from "../importTypes";
import { normalizeSpell } from "./spell";
import { normalizeItem } from "./item";
import { normalizeSpecies } from "./species";
import { normalizeClass } from "./class";
import { normalizeSubclass } from "./subclass";
import { normalizeBackground } from "./background";
import { normalizeFeat } from "./feat";

export const normalizeDetectedPayload = (
  payload: DetectedPayload,
  ctx: NormalizeContext
): NormalizedBatch => {
  const records = payload.records.filter((record) => record && typeof record === "object") as Array<
    Record<string, unknown>
  >;
  switch (payload.entityType) {
    case "spell":
      return { entityType: "spell", entities: records.map((record) => normalizeSpell(record, ctx)) };
    case "item":
      return { entityType: "item", entities: records.map((record) => normalizeItem(record, ctx)) };
    case "species":
      return { entityType: "species", entities: records.map((record) => normalizeSpecies(record, ctx)) };
    case "class":
      return { entityType: "class", entities: records.map((record) => normalizeClass(record, ctx)) };
    case "subclass":
      return { entityType: "subclass", entities: records.map((record) => normalizeSubclass(record, ctx)) };
    case "background":
      return { entityType: "background", entities: records.map((record) => normalizeBackground(record, ctx)) };
    case "feat":
      return { entityType: "feat", entities: records.map((record) => normalizeFeat(record, ctx)) };
    default:
      return { entityType: payload.entityType, entities: [] };
  }
};
