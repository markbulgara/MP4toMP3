"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  runImport,
  type ImportOptions,
  type ImportReport
} from "@ash/core";

const defaultOptions: ImportOptions = {
  overwrite: false,
  mergeMode: true,
  skipUnknown: true
};

export const ImportScreen = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [options, setOptions] = useState<ImportOptions>(defaultOptions);
  const [progress, setProgress] = useState({ filesProcessed: 0, totalFiles: 0 });
  const [report, setReport] = useState<ImportReport | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const totals = report?.totalsByType ?? {
    class: 0,
    subclass: 0,
    species: 0,
    background: 0,
    feat: 0,
    spell: 0,
    item: 0
  };

  const handleFiles = (list: FileList | File[]) => {
    const next = Array.from(list);
    setFiles(next);
    setErrors([]);
    setReport(null);
  };

  const startImport = async () => {
    setIsRunning(true);
    setReport(null);
    setErrors([]);
    abortRef.current = new AbortController();
    try {
      const result = await runImport(files, {
        ...options,
        onProgress: (value) =>
          setProgress({ filesProcessed: value.filesProcessed, totalFiles: value.totalFiles }),
        signal: abortRef.current.signal
      });
      setReport(result);
    } catch (error) {
      setErrors((prev) => [...prev, error instanceof Error ? error.message : "Import failed"]);
    } finally {
      setIsRunning(false);
    }
  };

  const downloadReport = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ashbeyond-import-${report.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const progressPercent = useMemo(() => {
    if (progress.totalFiles === 0) return 0;
    return Math.round((progress.filesProcessed / progress.totalFiles) * 100);
  }, [progress]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ash-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-ash-800">Import Data</h2>
        <p className="text-sm text-ash-500">
          Drag and drop JSON files (or select a folder if supported). Import is resilient and continues
          even if one file fails.
        </p>

        <div
          className="mt-4 flex min-h-[140px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-ash-200 bg-ash-50 text-sm text-ash-500"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (event.dataTransfer.files) {
              handleFiles(event.dataTransfer.files);
            }
          }}
        >
          <p>Drop files here</p>
          <p className="text-xs">or use the file picker below</p>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            type="file"
            multiple
            accept=".json"
            onChange={(event) => event.target.files && handleFiles(event.target.files)}
            className="text-xs"
          />
          <input
            type="file"
            multiple
            // @ts-expect-error webkitdirectory is non-standard but supported in Chromium.
            webkitdirectory=""
            onChange={(event) => event.target.files && handleFiles(event.target.files)}
            className="text-xs"
          />
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-2 text-xs text-ash-600">
            <input
              type="checkbox"
              checked={options.overwrite}
              onChange={(event) => setOptions({ ...options, overwrite: event.target.checked })}
            />
            Overwrite existing entities
          </label>
          <label className="flex items-center gap-2 text-xs text-ash-600">
            <input
              type="checkbox"
              checked={options.mergeMode}
              onChange={(event) => setOptions({ ...options, mergeMode: event.target.checked })}
            />
            Merge mode (namespace collisions)
          </label>
          <label className="flex items-center gap-2 text-xs text-ash-600">
            <input
              type="checkbox"
              checked={options.skipUnknown}
              onChange={(event) => setOptions({ ...options, skipUnknown: event.target.checked })}
            />
            Skip unknown file types
          </label>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            className="rounded-lg bg-ash-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            onClick={startImport}
            disabled={files.length === 0 || isRunning}
          >
            Start Import
          </button>
          <button
            className="rounded-lg border border-ash-200 px-4 py-2 text-xs"
            onClick={() => abortRef.current?.abort()}
            disabled={!isRunning}
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-ash-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-ash-700">Progress</h3>
        <div className="mt-3 h-2 rounded-full bg-ash-100">
          <div className="h-2 rounded-full bg-ash-800" style={{ width: `${progressPercent}%` }} />
        </div>
        <p className="mt-2 text-xs text-ash-500">
          {progress.filesProcessed}/{progress.totalFiles} files processed
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-ash-600 md:grid-cols-4">
          {Object.entries(totals).map(([key, value]) => (
            <div key={key} className="rounded-lg border border-ash-100 bg-ash-50 p-2">
              <p className="capitalize">{key}</p>
              <p className="text-sm font-semibold text-ash-800">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {(report || errors.length > 0) && (
        <div className="rounded-2xl border border-ash-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ash-700">Import Summary</h3>
            <button
              className="rounded-lg border border-ash-200 px-3 py-1 text-xs"
              onClick={() => setShowSummary(true)}
            >
              View Import Summary
            </button>
          </div>
          <div className="mt-4 space-y-2 text-xs text-ash-600">
            {report && (
              <p>
                Inserted {report.inserted}, updated {report.updated}, skipped {report.skipped}.
              </p>
            )}
            {errors.map((error, index) => (
              <p key={index} className="text-red-500">
                {error}
              </p>
            ))}
          </div>
          {report && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                className="rounded-lg bg-ash-800 px-4 py-2 text-xs font-semibold text-white"
                onClick={downloadReport}
              >
                Download JSON Report
              </button>
              <Link href="/" className="rounded-lg border border-ash-200 px-4 py-2 text-xs">
                Go to Compendium
              </Link>
              <Link
                href="/characters/new"
                className="rounded-lg border border-ash-200 px-4 py-2 text-xs"
              >
                Go to Character Builder
              </Link>
            </div>
          )}
        </div>
      )}

      {showSummary && report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ash-700">Import Summary</h3>
              <button className="text-xs text-ash-500" onClick={() => setShowSummary(false)}>
                Close
              </button>
            </div>
            <div className="mt-4 space-y-2 text-xs text-ash-600">
              <p>Inserted: {report.inserted}</p>
              <p>Updated: {report.updated}</p>
              <p>Skipped: {report.skipped}</p>
              <p>Errors: {report.errors.length}</p>
              <p>Warnings: {report.warnings.length}</p>
            </div>
            <div className="mt-4 max-h-40 overflow-auto rounded-lg border border-ash-200 p-3 text-[11px]">
              {report.warnings.map((warning, index) => (
                <p key={index}>
                  {warning.file}: {warning.reason}
                </p>
              ))}
              {report.errors.map((error, index) => (
                <p key={index} className="text-red-500">
                  {error.file}: {error.reason}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
