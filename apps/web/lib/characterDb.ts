import Dexie, { type Table } from "dexie";

export type CharacterRecord = {
  id: string;
  name: string;
  level: number;
  className?: string;
  species?: string;
  background?: string;
  abilities: Record<string, number>;
  skills: string[];
  proficiencies: string[];
  equipment: { id: string; name: string; weight?: number; equipped?: boolean }[];
  spells: { id: string; name: string }[];
  notes?: string;
};

class CharacterDB extends Dexie {
  characters!: Table<CharacterRecord, string>;
  constructor() {
    super("ashbeyond-characters");
    this.version(1).stores({
      characters: "id, name, level"
    });
  }
}

export const characterDb = new CharacterDB();
