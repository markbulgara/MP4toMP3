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

export class RemoteProvider implements ContentProvider {
  private index = createIndex();
  constructor(
    public id: string,
    public name: string,
    public version: string,
    private baseUrl: string
  ) {}

  getCapabilities(): ProviderCapabilities {
    return {
      supportedTypes: ["class", "subclass", "species", "background", "feat", "spell", "item"],
      offline: false
    };
  }

  async ensureIndexed() {
    const entities = await db.entities.where("providerId").equals(this.id).toArray();
    this.index = createIndex();
    entities.forEach((entity) => this.index.add(entity));
  }

  private async fetchAndCache(type: EntityType, paging: Paging) {
    const response = await fetch(
      `${this.baseUrl}/entities/${type}?page=${paging.page}&pageSize=${paging.pageSize}`
    );
    if (!response.ok) {
      throw new Error(`Remote provider error: ${response.status}`);
    }
    const data = (await response.json()) as PagedResult<AnyEntity>;
    const stored = data.items.map((entity) => ({ ...entity, providerId: this.id } as StoredEntity));
    await db.entities.bulkPut(stored);
    await this.ensureIndexed();
    return data;
  }

  async listEntities(
    type: EntityType,
    filters: ProviderFilters,
    paging: Paging
  ): Promise<PagedResult<AnyEntity>> {
    if (filters.name) {
      const match = await db.entities
        .where("providerId")
        .equals(this.id)
        .and((entity) => entity.type === type)
        .and((entity) => entity.name.toLowerCase().includes(filters.name!.toLowerCase()))
        .toArray();
      return {
        items: match,
        total: match.length,
        page: paging.page,
        pageSize: paging.pageSize
      };
    }
    const cached = await db.entities
      .where("providerId")
      .equals(this.id)
      .and((entity) => entity.type === type)
      .offset(paging.page * paging.pageSize)
      .limit(paging.pageSize)
      .toArray();
    if (cached.length > 0) {
      return { items: cached, total: cached.length, page: paging.page, pageSize: paging.pageSize };
    }
    return this.fetchAndCache(type, paging);
  }

  async getEntity(type: EntityType, id: string): Promise<AnyEntity | null> {
    const cached = await db.entities.get([this.id, id]);
    if (cached) {
      return cached.type === type ? cached : null;
    }
    const response = await fetch(`${this.baseUrl}/entities/${type}/${id}`);
    if (!response.ok) {
      return null;
    }
    const entity = (await response.json()) as AnyEntity;
    await db.entities.put({ ...entity, providerId: this.id });
    await this.ensureIndexed();
    return entity;
  }

  async search(
    query: string,
    _filters: ProviderFilters,
    paging: Paging
  ): Promise<PagedResult<SearchResult>> {
    const results = this.index.search(query, { enrich: true, limit: paging.pageSize });
    const ids = results.flatMap((entry) => entry.result.map((item) => item.id));
    if (ids.length === 0) {
      const response = await fetch(
        `${this.baseUrl}/search?q=${encodeURIComponent(query)}&page=${paging.page}&pageSize=${
          paging.pageSize
        }`
      );
      if (!response.ok) {
        return { items: [], total: 0, page: paging.page, pageSize: paging.pageSize };
      }
      const data = (await response.json()) as PagedResult<SearchResult>;
      return data;
    }
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
      enabled: false,
      sourceType: "remote",
      baseUrl: this.baseUrl,
      createdAt: new Date().toISOString()
    };
    await db.providers.put(metadata);
  }
}
