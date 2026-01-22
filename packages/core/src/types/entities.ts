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
};

export type Spell = EntityBase & {
  type: "spell";
  level: number;
  school?: string;
  castingTime?: string;
  range?: string;
  duration?: string;
  components?: string;
};

export type Item = EntityBase & {
  type: "item";
  rarity?: string;
  weight?: number;
  value?: string;
};

export type Species = EntityBase & {
  type: "species";
  speed?: number;
};

export type Class = EntityBase & {
  type: "class";
  hitDie?: string;
  primaryAbility?: string[];
};

export type Subclass = EntityBase & {
  type: "subclass";
  parentClassId?: string;
};

export type Background = EntityBase & {
  type: "background";
  proficiencies?: string[];
};

export type Feat = EntityBase & {
  type: "feat";
  prerequisites?: string[];
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
