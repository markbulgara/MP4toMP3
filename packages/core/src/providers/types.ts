import type { AnyEntity, EntityType, PagedResult, SearchResult } from "../types/entities";

export type ProviderCapabilities = {
  supportedTypes: EntityType[];
  offline: boolean;
};

export type ProviderFilters = {
  source?: string;
  level?: number;
  name?: string;
};

export type Paging = {
  page: number;
  pageSize: number;
};

export type ContentProvider = {
  id: string;
  name: string;
  version: string;
  getCapabilities(): ProviderCapabilities;
  listEntities(type: EntityType, filters: ProviderFilters, paging: Paging): Promise<PagedResult<AnyEntity>>;
  getEntity(type: EntityType, id: string): Promise<AnyEntity | null>;
  search(query: string, filters: ProviderFilters, paging: Paging): Promise<PagedResult<SearchResult>>;
  getRawIndexStats(): Promise<Record<string, number>>;
};

export type ProviderRegistration = {
  provider: ContentProvider;
  enabled: boolean;
};
