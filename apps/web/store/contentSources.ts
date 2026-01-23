import { create } from "zustand";
import type { LicensePackProvider, LocalImportProvider, ProviderMetadata, StoredEntity } from "@ash/core";
import { db, detectEntities, normalizeEntity } from "@ash/core";
import { getRegistry, registerLicensePack, registerRemoteProvider } from "@/lib/providers";

export type ContentSourcesState = {
  providers: ProviderMetadata[];
  loading: boolean;
  loadProviders: () => Promise<void>;
  toggleProvider: (id: string) => Promise<void>;
  importLocalFiles: (files: FileList) => Promise<void>;
  installLicensePack: (manifest: { id: string; name: string; version: string }, files: FileList) => Promise<void>;
  addRemoteProvider: (config: { id: string; name: string; version: string; baseUrl: string }) => Promise<void>;
};

export const useContentSources = create<ContentSourcesState>((set, get) => ({
  providers: [],
  loading: false,
  loadProviders: async () => {
    set({ loading: true });
    const registry = getRegistry();
    const localEntry = registry.getProvider("local");
    if (localEntry) {
      const existing = await db.providers.get("local");
      if (!existing) {
        const provider = localEntry.provider as LocalImportProvider;
        await provider.registerMetadata();
      }
    }
    const providers = await db.providers.toArray();
    for (const provider of providers) {
      if (provider.id === "local") {
        continue;
      }
      const existing = registry.getProvider(provider.id);
      if (existing) {
        continue;
      }
      if (provider.sourceType === "license") {
        await registerLicensePack(provider.id, provider.name, provider.version);
      }
      if (provider.sourceType === "remote" && provider.baseUrl) {
        await registerRemoteProvider(provider.id, provider.name, provider.version, provider.baseUrl);
      }
    }
    providers.forEach((provider) => {
      try {
        registry.setEnabled(provider.id, provider.enabled);
      } catch {
        // ignore missing providers
      }
    });
    set({ providers, loading: false });
  },
  toggleProvider: async (id) => {
    const existing = await db.providers.get(id);
    if (!existing) {
      return;
    }
    const updated = { ...existing, enabled: !existing.enabled };
    await db.providers.put(updated);
    const registry = getRegistry();
    registry.setEnabled(id, updated.enabled);
    await get().loadProviders();
  },
  importLocalFiles: async (files) => {
    const registry = getRegistry();
    const providerEntry = registry.getProvider("local");
    if (!providerEntry) {
      return;
    }
    const rawFiles = Array.from(files);
    const entities: StoredEntity[] = [];
    for (const file of rawFiles) {
      const text = await file.text();
      const json = JSON.parse(text) as Record<string, unknown>;
      const detected = detectEntities(json);
      detected.forEach(({ type, entries }) => {
        entries.forEach((entry) => {
          const normalized = normalizeEntity(type, entry);
          entities.push({ ...normalized, providerId: "local" });
        });
      });
    }
    const provider = providerEntry.provider as LocalImportProvider;
    await provider.importEntities(entities);
    await provider.registerMetadata();
    await get().loadProviders();
  },
  installLicensePack: async (manifest, files) => {
    await registerLicensePack(manifest.id, manifest.name, manifest.version);
    const registry = getRegistry();
    const providerEntry = registry.getProvider(manifest.id);
    if (!providerEntry) {
      return;
    }
    const entities: StoredEntity[] = [];
    for (const file of Array.from(files)) {
      const json = JSON.parse(await file.text()) as Record<string, unknown>;
      const detected = detectEntities(json);
      detected.forEach(({ type, entries }) => {
        entries.forEach((entry) => {
          const normalized = normalizeEntity(type, entry);
          entities.push({ ...normalized, providerId: manifest.id });
        });
      });
    }
    const provider = providerEntry.provider as LicensePackProvider;
    await provider.importEntities(entities);
    await get().loadProviders();
  },
  addRemoteProvider: async (config) => {
    await registerRemoteProvider(config.id, config.name, config.version, config.baseUrl);
    await get().loadProviders();
  }
}));
