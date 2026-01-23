import {
  LicensePackProvider,
  LocalImportProvider,
  ProviderRegistry,
  RemoteProvider,
  db
} from "@ash/core";

let registry: ProviderRegistry | null = null;

export const getRegistry = () => {
  if (!registry) {
    registry = new ProviderRegistry();
    const local = new LocalImportProvider();
    registry.register(local);
  }
  return registry;
};

export const registerLicensePack = async (id: string, name: string, version: string) => {
  const provider = new LicensePackProvider(id, name, version);
  getRegistry().register(provider);
  await provider.registerMetadata();
  await provider.ensureIndexed();
};

export const registerRemoteProvider = async (id: string, name: string, version: string, baseUrl: string) => {
  const provider = new RemoteProvider(id, name, version, baseUrl);
  getRegistry().register(provider);
  await provider.registerMetadata();
};

export const loadProviderMetadata = async () => {
  const stored = await db.providers.toArray();
  return stored;
};
