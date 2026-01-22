import Dexie, { type Table } from "dexie";
import type {
  Background,
  Class,
  Feat,
  Item,
  Spell,
  Species,
  Subclass,
  AnyEntity,
  EntityType
} from "../types/entities";

export type StoredEntity = AnyEntity & {
  providerId: string;
  type: EntityType;
};

export type SearchIndexRecord = {
  id: string;
  type: EntityType;
  name: string;
  source?: string;
  tags?: string[];
  text?: string;
};

export type ImportRun = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  totals: Record<string, number>;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type ProviderMetadata = {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  sourceType: "local" | "license" | "remote";
  baseUrl?: string;
  createdAt: string;
};

export class AshBeyondDB extends Dexie {
  entities!: Table<StoredEntity, string>;
  providers!: Table<ProviderMetadata, string>;
  spells!: Table<Spell, string>;
  items!: Table<Item, string>;
  species!: Table<Species, string>;
  classes!: Table<Class, string>;
  subclasses!: Table<Subclass, string>;
  backgrounds!: Table<Background, string>;
  feats!: Table<Feat, string>;
  searchIndex!: Table<SearchIndexRecord, string>;
  importRuns!: Table<ImportRun, string>;

  constructor() {
    super("ashbeyond");
    this.version(1).stores({
      entities: "[providerId+id], providerId, id, type, name",
      providers: "id",
      spells: "id, name, source",
      items: "id, name, source",
      species: "id, name, source",
      classes: "id, name, source",
      subclasses: "id, name, source",
      backgrounds: "id, name, source",
      feats: "id, name, source",
      searchIndex: "id, type, name, source",
      importRuns: "id, startedAt"
    });
  }
}

export const db = new AshBeyondDB();
