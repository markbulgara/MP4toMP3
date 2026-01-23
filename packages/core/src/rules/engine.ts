export type AbilityScores = {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
};

export type Character = {
  name: string;
  level: number;
  abilities: AbilityScores;
  proficiencies: string[];
  skills: string[];
  equipment: { id: string; name: string; weight?: number; equipped?: boolean }[];
  armorClass?: number;
  hitPoints?: number;
  tempHp?: number;
  hitDice?: string;
};

export const abilityModifier = (score: number) => Math.floor((score - 10) / 2);

export const proficiencyBonus = (level: number) => 2 + Math.floor((level - 1) / 4);

export const skillModifier = (score: number, proficient: boolean, level: number) =>
  abilityModifier(score) + (proficient ? proficiencyBonus(level) : 0);

export const passivePerception = (wisdom: number, proficient: boolean, level: number) =>
  10 + skillModifier(wisdom, proficient, level);

export const armorClass = (base: number, dex: number, dexCap?: number) => {
  const dexMod = abilityModifier(dex);
  const appliedDex = dexCap ? Math.min(dexMod, dexCap) : dexMod;
  return base + appliedDex;
};

export const totalWeight = (items: { weight?: number }[]) =>
  items.reduce((sum, item) => sum + (item.weight ?? 0), 0);

export const applySpecies = (character: Character, species: { name: string }) => ({
  ...character,
  proficiencies: [...character.proficiencies, species.name]
});

export const applyBackground = (character: Character, background: { name: string }) => ({
  ...character,
  proficiencies: [...character.proficiencies, background.name]
});

export const applyClassLevel = (character: Character, classId: string, delta: number) => ({
  ...character,
  level: Math.max(1, character.level + delta),
  proficiencies: [...character.proficiencies, classId]
});

export const applyItemEquip = (character: Character, itemId: string, equipped: boolean) => ({
  ...character,
  equipment: character.equipment.map((item) =>
    item.id === itemId ? { ...item, equipped } : item
  )
});
