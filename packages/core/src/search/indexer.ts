import FlexSearch from "flexsearch";
import type { AnyEntity, EntityType } from "../types/entities";
import { db } from "../storage/db";

const indexes = new Map<EntityType, FlexSearch.Document<AnyEntity, true>>();

const createIndex = () =>
  new FlexSearch.Document<AnyEntity, true>({
    tokenize: "forward",
    document: {
      id: "id",
      index: ["name", "text", "description"]
    }
  });

const getIndex = (type: EntityType) => {
  if (!indexes.has(type)) {
    indexes.set(type, createIndex());
  }
  return indexes.get(type)!;
};

export const indexEntities = async (type: EntityType, entities: AnyEntity[]) => {
  const index = getIndex(type);
  entities.forEach((entity) => index.add(entity));
  await db.searchIndex.bulkPut(
    entities.map((entity) => ({
      id: entity.id,
      type,
      name: entity.name,
      source: entity.source,
      tags: entity.tags,
      text: entity.text
    }))
  );
};

export const rebuildSearchIndex = async (entityTypes?: EntityType[]) => {
  const types: EntityType[] = entityTypes ?? ["class", "subclass", "species", "background", "feat", "spell", "item"];
  const stats: Record<string, number> = {};
  for (const type of types) {
    const index = createIndex();
    indexes.set(type, index);
    const table = {
      class: db.classes,
      subclass: db.subclasses,
      species: db.species,
      background: db.backgrounds,
      feat: db.feats,
      spell: db.spells,
      item: db.items
    }[type];
    const entities = await table.toArray();
    entities.forEach((entity) => index.add(entity));
    stats[type] = entities.length;
  }
  return stats;
};

export const searchEntities = async (
  type: EntityType,
  query: string,
  filters: { source?: string; tags?: string[] },
  page: number,
  pageSize: number
) => {
  const table = {
    class: db.classes,
    subclass: db.subclasses,
    species: db.species,
    background: db.backgrounds,
    feat: db.feats,
    spell: db.spells,
    item: db.items
  }[type];

  if (!query) {
    let collection = table.toCollection();
    if (filters.source) {
      collection = collection.filter((item) => item.source === filters.source);
    }
    if (filters.tags?.length) {
      collection = collection.filter((item) => filters.tags!.every((tag) => item.tags?.includes(tag)));
    }
    const total = await collection.count();
    const items = await collection
      .offset(page * pageSize)
      .limit(pageSize)
      .toArray();
    return { items, total };
  }

  const index = getIndex(type);
  const results = index.search(query, { enrich: true, limit: pageSize });
  const ids = results.flatMap((result) => result.result.map((entry) => entry.id));
  if (ids.length === 0) {
    const fallback = await table
      .filter((item) => item.name.toLowerCase().includes(query.toLowerCase()))
      .offset(page * pageSize)
      .limit(pageSize)
      .toArray();
    return { items: fallback, total: fallback.length };
  }
  const items = await table.where("id").anyOf(ids).toArray();
  return { items, total: items.length };
};
