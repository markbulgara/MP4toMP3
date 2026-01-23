import FlexSearch from "flexsearch";
import type { AnyEntity, EntityType, PagedResult, SearchResult } from "../types/entities";
import type { ContentProvider, Paging, ProviderCapabilities, ProviderFilters } from "./types";
import { db, type ProviderMetadata, type StoredEntity } from "../storage/db";

const createIndex = () =>
  new FlexSearch.Document<StoredEntity, true>({
    tokenize: "forward",
    document: {
      id: "id",
      index: ["name", "description"]
    }
  });

export class LocalImportProvider implements ContentProvider {
  id = "local";
  name = "Local Import";
  version = "1.0.0";
  private index = createIndex();

  getCapabilities(): ProviderCapabilities {
    return {
      supportedTypes: ["class", "subclass", "species", "background", "feat", "spell", "item"],
      offline: true
    };
  }

  async ensureIndexed() {
    const entities = await db.entities.where("providerId").equals(this.id).toArray();
    this.index = createIndex();
    entities.forEach((entity) => this.index.add(entity));
  }

  async listEntities(
    type: EntityType,
    filters: ProviderFilters,
    paging: Paging
  ): Promise<PagedResult<AnyEntity>> {
    const query = db.entities.where("providerId").equals(this.id).and((entity) => entity.type === type);
    const filtered = filters.name
      ? query.and((entity) => entity.name.toLowerCase().includes(filters.name!.toLowerCase()))
      : query;
    const total = await filtered.count();
    const items = await filtered
      .offset(paging.page * paging.pageSize)
      .limit(paging.pageSize)
      .toArray();
    return { items, total, page: paging.page, pageSize: paging.pageSize };
  }

  async getEntity(type: EntityType, id: string): Promise<AnyEntity | null> {
    const entity = await db.entities.get([this.id, id]);
    return entity?.type === type ? entity : null;
  }

  async search(
    query: string,
    _filters: ProviderFilters,
    paging: Paging
  ): Promise<PagedResult<SearchResult>> {
    const results = this.index.search(query, { enrich: true, limit: paging.pageSize });
    const ids = results.flatMap((entry) => entry.result.map((item) => item.id));
    const items = await db.entities
      .where("id")
      .anyOf(ids)
      .and((entity) => entity.providerId === this.id)
      .toArray();
    return {
      items: items.map((entity) => ({
        id: entity.id,
        name: entity.name,
        type: entity.type,
        providerId: entity.providerId,
        snippet: entity.description?.slice(0, 120)
      })),
      total: items.length,
      page: paging.page,
      pageSize: paging.pageSize
    };
  }

  async getRawIndexStats() {
    const count = await db.entities.where("providerId").equals(this.id).count();
    return { count };
  }

  async registerMetadata() {
    const metadata: ProviderMetadata = {
      id: this.id,
      name: this.name,
      version: this.version,
      enabled: true,
      sourceType: "local",
      createdAt: new Date().toISOString()
    };
    await db.providers.put(metadata);
  }

  async importEntities(entities: StoredEntity[]) {
    await db.entities.bulkPut(entities);
    await this.ensureIndexed();
  }
}
