export type EntityType =
  | "class"
  | "subclass"
  | "species"
  | "background"
  | "feat"
  | "spell"
  | "item";

export type EntityBase = {
  id: string;
  name: string;
  type: EntityType;
  source?: string;
  description?: string;
  entries?: string[];
  text?: string;
  tags?: string[];
  raw?: unknown;
};

export type Spell = EntityBase & {
  type: "spell";
  level: number;
  school?: string;
  castingTime?: string;
  range?: string;
  duration?: string;
  components?: string;
  classes?: string[];
  entriesText?: string;
};

export type Item = EntityBase & {
  type: "item";
  itemType?: string;
  rarity?: string;
  weight?: number;
  value?: string | number;
  weaponProps?: string[];
  armor?: { acBase: number; dexCap?: number; category?: string };
};

export type Species = EntityBase & {
  type: "species";
  size?: string | string[];
  speed?: number | Record<string, number>;
  featuresText?: string;
  abilityBonuses?: Record<string, number>;
};

export type Class = EntityBase & {
  type: "class";
  hitDie?: string;
  primaryAbility?: string[];
  proficiencies?: string[];
  levels?: Array<{ level: number; features: string[] }>;
};

export type Subclass = EntityBase & {
  type: "subclass";
  parentClassId?: string;
  levels?: Array<{ level: number; features: string[] }>;
};

export type Background = EntityBase & {
  type: "background";
  proficiencies?: string[];
  featuresText?: string;
  proficienciesText?: string;
};

export type Feat = EntityBase & {
  type: "feat";
  prerequisites?: string[];
  featuresText?: string;
};

export type AnyEntity =
  | Spell
  | Item
  | Species
  | Class
  | Subclass
  | Background
  | Feat;

export type PagedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type SearchResult = {
  id: string;
  name: string;
  type: EntityType;
  providerId: string;
  snippet?: string;
};
