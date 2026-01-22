import type { EntityType } from "../types/entities";
import { db } from "../storage/db";
import type { ImportOptions, NormalizedBatch, UpsertResult } from "./importTypes";

const tableForType = (type: EntityType) => {
  switch (type) {
    case "spell":
      return db.spells;
    case "item":
      return db.items;
    case "species":
      return db.species;
    case "class":
      return db.classes;
    case "subclass":
      return db.subclasses;
    case "background":
      return db.backgrounds;
    case "feat":
      return db.feats;
    default:
      return db.spells;
  }
};

const resolveCollisionId = async (type: EntityType, id: string) => {
  let suffix = 2;
  const table = tableForType(type);
  let candidate = `${id}~${suffix}`;
  while (await table.get(candidate)) {
    suffix += 1;
    candidate = `${id}~${suffix}`;
  }
  return candidate;
};

export const upsertNormalizedBatch = async (
  batch: NormalizedBatch,
  options: ImportOptions
): Promise<UpsertResult> => {
  const table = tableForType(batch.entityType);
  const result: UpsertResult = { inserted: 0, updated: 0, skipped: 0, collisions: [] };

  for (const [index, entity] of batch.entities.entries()) {
    const existing = await table.get(entity.id);
    if (existing) {
      if (options.overwrite) {
        await table.put(entity);
        result.updated += 1;
        continue;
      }
      if (options.mergeMode) {
        const newId = await resolveCollisionId(batch.entityType, entity.id);
        result.collisions.push({ id: entity.id, type: batch.entityType, resolvedId: newId });
        await table.put({ ...entity, id: newId });
        result.inserted += 1;
        continue;
      }
      result.skipped += 1;
      result.collisions.push({ id: entity.id, type: batch.entityType });
      continue;
    }
    await table.put(entity);
    result.inserted += 1;

    if (index > 0 && index % 500 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return result;
};
