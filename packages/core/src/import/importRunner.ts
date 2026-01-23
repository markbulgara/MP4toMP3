import type { EntityType } from "../types/entities";
import { db } from "../storage/db";
import { detectFilePayload } from "./detectors";
import { normalizeDetectedPayload } from "./normalizers";
import { createEmptyReport, incrementTotals } from "./importReport";
import type { DetectedPayload, ImportOptions, ImportReport, ImportProgress, NormalizedBatch, UpsertResult } from "./importTypes";
import { upsertNormalizedBatch } from "./upsert";
import { indexEntities } from "../search/indexer";

const createTotals = (): Record<EntityType, number> => ({
  class: 0,
  subclass: 0,
  species: 0,
  background: 0,
  feat: 0,
  spell: 0,
  item: 0
});

const shouldAbort = (options: ImportOptions) => {
  if (options.signal?.aborted) {
    throw new Error("Import cancelled");
  }
};

export const runImport = async (files: File[], options: ImportOptions): Promise<ImportReport> => {
  const report = createEmptyReport();
  const totalsByType = createTotals();
  const progress: ImportProgress = {
    filesProcessed: 0,
    totalFiles: files.length,
    totalsByType
  };
  report.startedAt = new Date().toISOString();

  for (const file of files) {
    shouldAbort(options);
    progress.currentFile = file.name;
    options.onProgress?.(progress);

    if (file.size > 15 * 1024 * 1024) {
      report.warnings.push({ file: file.name, reason: "File exceeds 15MB, import may take longer." });
    }

    let json: unknown;
    try {
      const text = await file.text();
      json = JSON.parse(text);
    } catch (error) {
      report.errors.push({
        file: file.name,
        reason: "Failed to parse JSON",
        stack: error instanceof Error ? error.stack : undefined
      });
      progress.filesProcessed += 1;
      options.onProgress?.(progress);
      continue;
    }

    let detected: DetectedPayload[] = [];
    try {
      detected = detectFilePayload(json, file.name);
    } catch (error) {
      report.errors.push({
        file: file.name,
        reason: "Failed to detect payload",
        stack: error instanceof Error ? error.stack : undefined
      });
      progress.filesProcessed += 1;
      options.onProgress?.(progress);
      continue;
    }

    if (detected.length === 0) {
      if (!options.skipUnknown) {
        report.warnings.push({ file: file.name, reason: "Unknown file type" });
      }
      progress.filesProcessed += 1;
      options.onProgress?.(progress);
      continue;
    }

    for (const payload of detected) {
      shouldAbort(options);
      if (payload.confidence < 0.5) {
        report.warnings.push({ file: file.name, reason: `Low confidence detection for ${payload.entityType}` });
      }
      const batch = normalizeDetectedPayload(payload, {
        sourceHint: payload.sourceHint ?? file.name,
        fileName: file.name,
        storeRaw: options.storeRaw
      });
      incrementTotals(totalsByType, batch.entityType, batch.entities.length);
      const upsertResult = await upsertNormalizedBatch(batch, options);
      report.inserted += upsertResult.inserted;
      report.updated += upsertResult.updated;
      report.skipped += upsertResult.skipped;
      report.collisions.push(...upsertResult.collisions);

      await indexEntities(batch.entityType, batch.entities);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    progress.filesProcessed += 1;
    options.onProgress?.(progress);
  }

  report.totalsByType = totalsByType;
  report.finishedAt = new Date().toISOString();

  await db.importRuns.put({
    id: report.id,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    totals: totalsByType,
    inserted: report.inserted,
    updated: report.updated,
    skipped: report.skipped,
    errors: report.errors.length
  });

  return report;
};

export { upsertNormalizedBatch } from "./upsert";
export type { ImportOptions, ImportReport, NormalizedBatch, UpsertResult } from "./importTypes";
