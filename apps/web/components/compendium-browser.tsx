"use client";

import { useEffect, useMemo, useRef } from "react";
import { useCompendium } from "@/store/compendium";
import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import type { EntityType } from "@ash/core";

const types: { label: string; value: EntityType }[] = [
  { label: "Classes", value: "class" },
  { label: "Species", value: "species" },
  { label: "Backgrounds", value: "background" },
  { label: "Feats", value: "feat" },
  { label: "Spells", value: "spell" },
  { label: "Items", value: "item" }
];

export const CompendiumBrowser = () => {
  const { type, query, items, loading, setType, setQuery, fetchItems } = useCompendium();
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchItems();
    }, 300);
    return () => clearTimeout(timer);
  }, [type, query, fetchItems]);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96
  });

  const rows = useMemo(() => rowVirtualizer.getVirtualItems(), [rowVirtualizer]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="rounded-2xl border border-ash-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-ash-800">Compendium</h2>
        <p className="text-sm text-ash-500">
          Browse installed content sources. Import JSON or license packs in Settings.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {types.map((entry) => (
            <button
              key={entry.value}
              className={clsx(
                "rounded-full px-3 py-1 text-xs font-medium transition",
                type === entry.value
                  ? "bg-ash-800 text-white"
                  : "bg-ash-100 text-ash-600 hover:bg-ash-200"
              )}
              onClick={() => setType(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-ash-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${type}...`}
            className="w-full rounded-lg border border-ash-200 px-3 py-2 text-sm outline-none focus:border-ash-400"
          />
          <button
            onClick={() => fetchItems()}
            className="rounded-lg bg-ash-800 px-4 py-2 text-xs font-semibold text-white"
          >
            Search
          </button>
        </div>
        <div ref={parentRef} className="mt-4 h-[60vh] overflow-auto">
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rows.map((virtualRow) => {
              const item = items[virtualRow.index];
              if (!item) {
                return null;
              }
              return (
                <div
                  key={item.id}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <div className="mb-3 rounded-xl border border-ash-100 bg-ash-50 p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ash-800">{item.name}</h3>
                      <span className="rounded-full bg-ash-200 px-2 py-1 text-[10px] text-ash-600">
                        {item.source ?? "Custom"}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-ash-500">
                      {item.description ?? "No description available."}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {loading && <p className="mt-2 text-xs text-ash-400">Loading...</p>}
      </div>
    </div>
  );
};
