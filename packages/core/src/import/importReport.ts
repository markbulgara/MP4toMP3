import type { EntityType } from "../types/entities";
import type { ImportReport } from "./importTypes";

export const createEmptyReport = (): ImportReport => ({
  id: crypto.randomUUID(),
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  totalsByType: {
    class: 0,
    subclass: 0,
    species: 0,
    background: 0,
    feat: 0,
    spell: 0,
    item: 0
  },
  inserted: 0,
  updated: 0,
  skipped: 0,
  errors: [],
  warnings: [],
  collisions: []
});

export const incrementTotals = (totals: Record<EntityType, number>, type: EntityType, count: number) => {
  totals[type] = (totals[type] ?? 0) + count;
};
