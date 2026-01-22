import type { AnyEntity, EntityType } from "../types/entities";

export type DetectedPayload = {
  entityType: EntityType;
  records: unknown[];
  sourceHint?: string;
  confidence: number;
  originalFileName: string;
};

export type NormalizeContext = {
  sourceHint?: string;
  fileName?: string;
  storeRaw?: boolean;
};

export type NormalizedBatch = {
  entityType: EntityType;
  entities: AnyEntity[];
  sourceHint?: string;
};

export type ImportOptions = {
  overwrite: boolean;
  mergeMode: boolean;
  skipUnknown: boolean;
  storeRaw?: boolean;
  onProgress?: (progress: ImportProgress) => void;
  signal?: AbortSignal;
};

export type ImportProgress = {
  filesProcessed: number;
  totalFiles: number;
  currentFile?: string;
  totalsByType: Record<EntityType, number>;
};

export type UpsertResult = {
  inserted: number;
  updated: number;
  skipped: number;
  collisions: Array<{ id: string; type: EntityType; resolvedId?: string }>;
};

export type ImportReport = {
  id: string;
  startedAt: string;
  finishedAt: string;
  totalsByType: Record<EntityType, number>;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ file: string; reason: string; stack?: string }>;
  warnings: Array<{ file: string; reason: string }>;
  collisions: Array<{ id: string; type: EntityType; resolvedId?: string }>;
};
