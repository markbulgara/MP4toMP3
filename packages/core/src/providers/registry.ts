import type { AnyEntity, EntityType, PagedResult, SearchResult } from "../types/entities";
import type { ContentProvider, Paging, ProviderFilters, ProviderRegistration } from "./types";

export class ProviderRegistry {
  private providers = new Map<string, ProviderRegistration>();

  register(provider: ContentProvider) {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, { provider, enabled: true });
  }

  setEnabled(providerId: string, enabled: boolean) {
    const entry = this.providers.get(providerId);
    if (!entry) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    entry.enabled = enabled;
  }

  listProviders() {
    return Array.from(this.providers.values());
  }

  getProvider(providerId: string) {
    return this.providers.get(providerId) ?? null;
  }

  private enabledProviders() {
    return Array.from(this.providers.values())
      .filter((entry) => entry.enabled)
      .map((entry) => entry.provider);
  }

  async listEntities(
    type: EntityType,
    filters: ProviderFilters,
    paging: Paging
  ): Promise<PagedResult<AnyEntity>> {
    const providers = this.enabledProviders();
    const responses = await Promise.all(
      providers.map(async (provider) => {
        const result = await provider.listEntities(type, filters, paging);
        return {
          providerId: provider.id,
          result
        };
      })
    );
    const items = responses.flatMap(({ providerId, result }) =>
      result.items.map((item) => ({ ...item, id: `${providerId}:${item.id}` }))
    );
    return {
      items,
      total: items.length,
      page: paging.page,
      pageSize: paging.pageSize
    };
  }

  async getEntity(type: EntityType, namespacedId: string): Promise<AnyEntity | null> {
    const [providerId, entityId] = namespacedId.split(":");
    const provider = this.providers.get(providerId)?.provider;
    if (!provider) {
      return null;
    }
    const entity = await provider.getEntity(type, entityId);
    return entity ? { ...entity, id: `${providerId}:${entity.id}` } : null;
  }

  async search(
    query: string,
    filters: ProviderFilters,
    paging: Paging
  ): Promise<PagedResult<SearchResult>> {
    const providers = this.enabledProviders();
    const responses = await Promise.all(
      providers.map(async (provider) => {
        const result = await provider.search(query, filters, paging);
        return result.items.map((item) => ({ ...item, providerId: provider.id }));
      })
    );
    const items = responses.flat();
    return {
      items,
      total: items.length,
      page: paging.page,
      pageSize: paging.pageSize
    };
  }

  async getRawIndexStats() {
    const providers = this.enabledProviders();
    const stats = await Promise.all(
      providers.map(async (provider) => ({
        providerId: provider.id,
        stats: await provider.getRawIndexStats()
      }))
    );
    return stats;
  }
}
