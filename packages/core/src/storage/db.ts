import Dexie, { type Table } from "dexie";
import type { AnyEntity, EntityType } from "../types/entities";

export type StoredEntity = AnyEntity & {
  providerId: string;
  type: EntityType;
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

  constructor() {
    super("ashbeyond");
    this.version(1).stores({
      entities: "[providerId+id], providerId, id, type, name",
      providers: "id"
    });
  }
}

export const db = new AshBeyondDB();
