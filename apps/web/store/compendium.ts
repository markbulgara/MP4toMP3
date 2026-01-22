import { create } from "zustand";
import type { AnyEntity, EntityType } from "@ash/core";
import { searchEntities } from "@ash/core";

export type CompendiumState = {
  type: EntityType;
  query: string;
  items: AnyEntity[];
  loading: boolean;
  setType: (type: EntityType) => void;
  setQuery: (query: string) => void;
  fetchItems: () => Promise<void>;
};

export const useCompendium = create<CompendiumState>((set, get) => ({
  type: "spell",
  query: "",
  items: [],
  loading: false,
  setType: (type) => set({ type }),
  setQuery: (query) => set({ query }),
  fetchItems: async () => {
    set({ loading: true });
    const { type, query } = get();
    const result = await searchEntities(type, query, {}, 0, 200);
    set({ items: result.items, loading: false });
  }
}));
