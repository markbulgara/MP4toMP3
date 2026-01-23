import { create } from "zustand";
import { characterDb, type CharacterRecord } from "@/lib/characterDb";

const defaultCharacter = (): CharacterRecord => ({
  id: crypto.randomUUID(),
  name: "New Hero",
  level: 1,
  abilities: {
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  },
  skills: [],
  proficiencies: [],
  equipment: [],
  spells: []
});

export type CharacterState = {
  characters: CharacterRecord[];
  selected?: CharacterRecord;
  loading: boolean;
  loadCharacters: () => Promise<void>;
  createCharacter: (draft?: Partial<CharacterRecord>) => Promise<CharacterRecord>;
  updateCharacter: (id: string, update: Partial<CharacterRecord>) => Promise<void>;
  deleteCharacter: (id: string) => Promise<void>;
  duplicateCharacter: (id: string) => Promise<void>;
  selectCharacter: (id: string) => Promise<void>;
};

export const useCharacters = create<CharacterState>((set, get) => ({
  characters: [],
  loading: false,
  loadCharacters: async () => {
    set({ loading: true });
    const characters = await characterDb.characters.toArray();
    set({ characters, loading: false });
  },
  createCharacter: async (draft) => {
    const character = { ...defaultCharacter(), ...draft };
    await characterDb.characters.put(character);
    await get().loadCharacters();
    return character;
  },
  updateCharacter: async (id, update) => {
    await characterDb.characters.update(id, update);
    await get().loadCharacters();
  },
  deleteCharacter: async (id) => {
    await characterDb.characters.delete(id);
    await get().loadCharacters();
  },
  duplicateCharacter: async (id) => {
    const existing = await characterDb.characters.get(id);
    if (!existing) {
      return;
    }
    const duplicate = { ...existing, id: crypto.randomUUID(), name: `${existing.name} Copy` };
    await characterDb.characters.put(duplicate);
    await get().loadCharacters();
  },
  selectCharacter: async (id) => {
    const selected = await characterDb.characters.get(id);
    if (selected) {
      set({ selected });
    }
  }
}));
