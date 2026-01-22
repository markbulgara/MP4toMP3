import { create } from "zustand";

export type WizardStep =
  | "species"
  | "class"
  | "background"
  | "abilities"
  | "proficiencies"
  | "equipment"
  | "spells"
  | "review";

export type CreatorState = {
  step: WizardStep;
  selections: {
    species?: string;
    class?: string;
    subclass?: string;
    background?: string;
    abilityScores: Record<string, number>;
    skills: string[];
    equipment: string[];
    spells: string[];
  };
  next: () => void;
  back: () => void;
  updateSelection: (update: Partial<CreatorState["selections"]>) => void;
};

const order: WizardStep[] = [
  "species",
  "class",
  "background",
  "abilities",
  "proficiencies",
  "equipment",
  "spells",
  "review"
];

export const useCreator = create<CreatorState>((set, get) => ({
  step: "species",
  selections: {
    abilityScores: {
      strength: 15,
      dexterity: 14,
      constitution: 13,
      intelligence: 12,
      wisdom: 10,
      charisma: 8
    },
    skills: [],
    equipment: [],
    spells: []
  },
  next: () => {
    const currentIndex = order.indexOf(get().step);
    const nextStep = order[Math.min(order.length - 1, currentIndex + 1)];
    set({ step: nextStep });
  },
  back: () => {
    const currentIndex = order.indexOf(get().step);
    const nextStep = order[Math.max(0, currentIndex - 1)];
    set({ step: nextStep });
  },
  updateSelection: (update) =>
    set((state) => ({
      selections: {
        ...state.selections,
        ...update
      }
    }))
}));
