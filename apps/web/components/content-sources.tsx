"use client";

import { useEffect, useState } from "react";
import { useContentSources } from "@/store/contentSources";

export const ContentSources = () => {
  const { providers, loadProviders, toggleProvider, importLocalFiles, installLicensePack, addRemoteProvider } =
    useContentSources();
  const [remoteConfig, setRemoteConfig] = useState({
    id: "",
    name: "",
    version: "1.0.0",
    baseUrl: ""
  });

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ash-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ash-800">Content Sources</h2>
        <p className="text-sm text-ash-500">
          Install local or licensed data packs. Remote providers are disabled by default.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-ash-100 bg-ash-50 p-4">
            <h3 className="text-sm font-semibold text-ash-700">Local Import</h3>
            <p className="mt-1 text-xs text-ash-500">
              Upload 5etools-format JSON files. Entities are normalized and cached locally.
            </p>
            <input
              type="file"
              multiple
              accept=".json"
              className="mt-3 text-xs"
              onChange={(event) => {
                if (event.target.files) {
                  importLocalFiles(event.target.files);
                }
              }}
            />
          </div>
          <div className="rounded-xl border border-ash-100 bg-ash-50 p-4">
            <h3 className="text-sm font-semibold text-ash-700">License Pack</h3>
            <p className="mt-1 text-xs text-ash-500">
              Provide a licensepack.json manifest plus content files.
            </p>
            <input
              type="file"
              multiple
              accept=".json"
              className="mt-3 text-xs"
              onChange={(event) => {
                const files = event.target.files;
                if (!files) return;
                const manifestFile = Array.from(files).find((file) => file.name === "licensepack.json");
                if (!manifestFile) return;
                manifestFile.text().then((text) => {
                  const manifest = JSON.parse(text) as { id: string; name: string; version: string };
                  installLicensePack(manifest, files);
                });
              }}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-ash-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-ash-700">Installed Providers</h3>
        <div className="mt-4 space-y-2">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center justify-between rounded-lg border border-ash-100 bg-ash-50 px-4 py-3 text-xs"
            >
              <div>
                <p className="font-semibold text-ash-700">{provider.name}</p>
                <p className="text-ash-500">{provider.id} • v{provider.version}</p>
              </div>
              <button
                className={`rounded-full px-3 py-1 text-[10px] ${
                  provider.enabled ? "bg-ash-800 text-white" : "bg-ash-200 text-ash-600"
                }`}
                onClick={() => toggleProvider(provider.id)}
              >
                {provider.enabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          ))}
          {providers.length === 0 && (
            <p className="text-xs text-ash-400">No providers installed yet.</p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-ash-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-ash-700">Remote Provider (optional)</h3>
        <p className="mt-1 text-xs text-ash-500">
          Supply a base URL to a compatible endpoint. This is disabled by default.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            className="rounded-lg border border-ash-200 px-3 py-2 text-xs"
            placeholder="Provider ID"
            value={remoteConfig.id}
            onChange={(event) => setRemoteConfig({ ...remoteConfig, id: event.target.value })}
          />
          <input
            className="rounded-lg border border-ash-200 px-3 py-2 text-xs"
            placeholder="Provider name"
            value={remoteConfig.name}
            onChange={(event) => setRemoteConfig({ ...remoteConfig, name: event.target.value })}
          />
          <input
            className="rounded-lg border border-ash-200 px-3 py-2 text-xs"
            placeholder="Base URL"
            value={remoteConfig.baseUrl}
            onChange={(event) => setRemoteConfig({ ...remoteConfig, baseUrl: event.target.value })}
          />
          <button
            className="rounded-lg bg-ash-800 px-4 py-2 text-xs font-semibold text-white"
            onClick={() => addRemoteProvider(remoteConfig)}
          >
            Add Remote Provider
          </button>
        </div>
      </div>
    </div>
  );
};
