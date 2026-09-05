import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  UploadCloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
} from "lucide-react";

import { DATASETS } from "../../config/workflow";
import { cn } from "../../components/layout/Layout";

// ============================================================
// CONSTANTS
// ============================================================

const ACCEPTED_EXTENSION = ".csv";
const MAX_FILE_SIZE_MB = 25;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// We only need the header row, so we peek at the first slice
// instead of reading multi-MB CSVs fully into memory.
const HEADER_PEEK_BYTES = 8192;

// ============================================================
// SMALL HELPERS
// ============================================================

/**
 * Parses a single CSV line, respecting quoted fields
 * that contain commas.
 */
function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);

  return cells.map((c) =>
    c.trim().replace(/^"|"$/g, "")
  );
}

function parseHeaderRow(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  return parseCsvLine(firstLine);
}

function normalize(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Reads a File/Blob as text.
 */
function readAsText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      resolve(String(e.target.result ?? ""));
    };

    reader.onerror = () => {
      reject(
        reader.error ||
          new Error("Unable to read file")
      );
    };

    reader.readAsText(blob);
  });
}

/**
 * Reads just enough of a file to get the header row.
 * Falls back to reading the full file if the header
 * is longer than the peek window.
 */
async function peekHeaderRow(file) {
  const slice = file.slice(
    0,
    HEADER_PEEK_BYTES
  );

  let text = await readAsText(slice);

  if (
    !text.includes("\n") &&
    file.size > HEADER_PEEK_BYTES
  ) {
    text = await readAsText(file);
  }

  return parseHeaderRow(text);
}

function missingColumnsFor(
  dataset,
  normalizedHeaders
) {
  return dataset.requiredColumns.filter(
    (col) =>
      !normalizedHeaders.includes(
        normalize(col)
      )
  );
}

// ============================================================
// DATASET CARD
// ============================================================

function DatasetCard({
  dataset,
  file,
  isDragOver,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileChange,
}) {
  const Icon = dataset.icon;

  const status = file?.status;

  // "reading" | "ok" | "error" | undefined
  const isOk = status === "ok";
  const isError = status === "error";
  const isReading = status === "reading";

  // Detect the moment a card becomes successful.
  // This allows the sweep + tick animation to replay
  // whenever a file is successfully validated.
  const prevStatusRef = useRef(status);
  const [successPulse, setSuccessPulse] = useState(0);

  useEffect(() => {
    if (
      status === "ok" &&
      prevStatusRef.current !== "ok"
    ) {
      setSuccessPulse((n) => n + 1);
    }

    prevStatusRef.current = status;
  }, [status]);

  return (
    <label
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "relative overflow-hidden cursor-pointer flex flex-col items-center gap-2 rounded-xl border px-4 pt-4 pb-7 sm:px-5 sm:pt-5 sm:pb-8 lg:px-6 lg:pt-6 lg:pb-8 text-center transition bg-white shadow-sm",

        isError
          ? "border-red-300"
          : isOk
          ? "border-emerald-300"
          : "border-slate-200 hover:border-indigo-300",

        isDragOver
          ? "ring-2 ring-indigo-400"
          : ""
      )}
    >
      {/* Real file input */}
      <input
        type="file"
        accept={ACCEPTED_EXTENSION}
        aria-label={`Upload CSV for ${dataset.label}`}
        onChange={onFileChange}
        className="absolute inset-0 z-30 w-full h-full opacity-0 cursor-pointer"
      />

      {/* Success wash */}
      {isOk && (
        <div
          key={`sweep-${successPulse}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 bg-emerald-50 animate-upload-sweep"
        />
      )}

      {/* Card content */}
      <div className="relative z-10 flex flex-col items-center gap-2">
        <div
          className={cn(
            "rounded-xl flex items-center justify-center mb-1 w-11 h-11 sm:w-12 sm:h-12 lg:w-14 lg:h-14",

            isError
              ? "bg-red-100 text-red-600"
              : isOk
              ? "bg-emerald-100 text-emerald-600"
              : "bg-indigo-50 text-indigo-600"
          )}
        >
          {isReading ? (
            <Loader2
              size={20}
              className="animate-spin sm:w-[22px] sm:h-[22px] lg:w-6 lg:h-6"
            />
          ) : (
            <Icon
              size={20}
              className="sm:w-[22px] sm:h-[22px] lg:w-6 lg:h-6"
            />
          )}
        </div>

        <div className="text-sm sm:text-base font-semibold text-slate-800">
          {dataset.label}
        </div>

        <div className="w-6 h-0.5 bg-indigo-200 rounded-full" />

        <div className="text-[10px] sm:text-xs text-slate-400 leading-snug min-h-[30px] px-0 sm:px-1">
          {dataset.hint}
        </div>

        <span
          className={cn(
            "mt-1 sm:mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium rounded-lg border px-2 sm:px-3 py-2 transition",

            isError
              ? "border-red-200 text-red-600 bg-red-50"
              : isOk
              ? "border-emerald-200 text-emerald-600 bg-emerald-50"
              : "border-indigo-100 text-indigo-600 bg-indigo-50/60 hover:bg-indigo-50"
          )}
        >
          <UploadCloud size={13} />

          <span>
            {isReading
              ? "Reading…"
              : isOk
              ? "Replace CSV"
              : "Upload CSV"}
          </span>
        </span>

        {isError &&
          file?.missing?.length > 0 && (
            <div
              className="text-[9px] sm:text-[10px] text-red-600 leading-tight"
              role="alert"
            >
              Missing:{" "}
              {file.missing
                .slice(0, 2)
                .join(", ")}

              {file.missing.length > 2
                ? "…"
                : ""}
            </div>
          )}
      </div>

      {/* Filename */}
      {file?.name && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 truncate text-center text-[9px] sm:text-[10px] text-slate-500">
          {file.name}
        </div>
      )}

      {/* Success tick */}
      {isOk && (
        <div
          key={`tick-${successPulse}`}
          className="absolute top-2 right-2 z-20 text-emerald-500 animate-upload-pop"
        >
          <CheckCircle2 size={15} />
        </div>
      )}

      {/* Error icon */}
      {isError && (
        <div className="absolute top-2 right-2 z-20 text-red-500">
          <XCircle size={15} />
        </div>
      )}
    </label>
  );
}

// ============================================================
// MAIN UPLOAD COMPONENT
// Step 1: Upload / Select Railway Data
// ============================================================

export default function UploadStep({
  files,
  setFiles,
  completedKeys,
  onContinue,
  onNavigate,
}) {
  const [cardDragOver, setCardDragOver] =
    useState(null);

  const [zoneDragActive, setZoneDragActive] =
    useState(false);

  const zoneInputRef = useRef(null);

  // ==========================================================
  // CORE: validate a single file
  // ==========================================================

  const processFile = useCallback(
    async (key, file) => {
      if (!file) return;

      // Validate extension
      if (
        !file.name
          .toLowerCase()
          .endsWith(ACCEPTED_EXTENSION)
      ) {
        setFiles((prev) => ({
          ...prev,
          [key]: {
            name: file.name,
            status: "error",
            missing: [
              "File must be a .csv export",
            ],
          },
        }));

        return;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setFiles((prev) => ({
          ...prev,
          [key]: {
            name: file.name,
            status: "error",
            missing: [
              `File exceeds ${MAX_FILE_SIZE_MB}MB limit`,
            ],
          },
        }));

        return;
      }

      // Reading state
      setFiles((prev) => ({
        ...prev,
        [key]: {
          name: file.name,
          status: "reading",
          missing: [],
        },
      }));

      try {
        const headers = (
          await peekHeaderRow(file)
        ).map(normalize);

        const dataset = DATASETS.find(
          (d) => d.key === key
        );

        const missing =
          missingColumnsFor(
            dataset,
            headers
          );

        setFiles((prev) => ({
          ...prev,

          [key]: {
            name: file.name,
            size: file.size,
            status:
              missing.length === 0
                ? "ok"
                : "error",
            missing,
          },
        }));
      } catch {
        setFiles((prev) => ({
          ...prev,

          [key]: {
            name: file.name,
            status: "error",
            missing: [
              "Could not read this file",
            ],
          },
        }));
      }
    },
    [setFiles]
  );

  // ==========================================================
  // PER-CARD UPLOAD / DRAG & DROP
  // ==========================================================

  const handleCardFileChange = (
    key,
    e
  ) => {
    const file =
      e.target.files?.[0];

    processFile(key, file);

    // Reset so selecting the same file again
    // still fires onChange.
    e.target.value = "";
  };

  const handleCardDrop = (
    key,
    e
  ) => {
    e.preventDefault();

    setCardDragOver(null);

    processFile(
      key,
      e.dataTransfer.files?.[0]
    );
  };

  // ==========================================================
  // GENERAL DROPZONE
  // Auto-matches dropped files to dataset
  // ==========================================================

  const scoreFileForDataset =
    async (file, dataset) => {
      try {
        const headers = (
          await peekHeaderRow(file)
        ).map(normalize);

        const matched =
          dataset.requiredColumns.length -
          missingColumnsFor(
            dataset,
            headers
          ).length;

        return (
          matched /
          dataset.requiredColumns.length
        );
      } catch {
        return 0;
      }
    };

  const handleZoneFiles =
    useCallback(
      async (fileList) => {
        const incoming =
          Array.from(
            fileList || []
          ).filter((f) =>
            f.name
              .toLowerCase()
              .endsWith(
                ACCEPTED_EXTENSION
              )
          );

        for (const file of incoming) {
          const scores =
            await Promise.all(
              DATASETS.map((d) =>
                scoreFileForDataset(
                  file,
                  d
                )
              )
            );

          const bestIndex =
            scores.reduce(
              (
                best,
                score,
                index
              ) =>
                score >
                scores[best]
                  ? index
                  : best,
              0
            );

          if (scores[bestIndex] > 0) {
            await processFile(
              DATASETS[bestIndex].key,
              file
            );
          } else {
            const emptyKey =
              DATASETS.find(
                (d) =>
                  !files[d.key]
              )?.key ??
              DATASETS[0].key;

            setFiles((prev) => ({
              ...prev,

              [emptyKey]: {
                name: file.name,
                status: "error",
                missing: [
                  "Couldn't match this file to a dataset",
                ],
              },
            }));
          }
        }
      },
      [processFile, files, setFiles]
    );

  const handleZoneDrop = (e) => {
    e.preventDefault();

    setZoneDragActive(false);

    handleZoneFiles(
      e.dataTransfer.files
    );
  };

  const handleZoneKeyDown = (e) => {
    if (
      e.key === "Enter" ||
      e.key === " "
    ) {
      e.preventDefault();

      zoneInputRef.current?.click();
    }
  };

  // ==========================================================
  // DERIVED STATUS
  // ==========================================================

  const readyCount = useMemo(
    () =>
      DATASETS.filter(
        (d) =>
          files[d.key]?.status ===
          "ok"
      ).length,
    [files]
  );

  const anyErrors = useMemo(
    () =>
      DATASETS.some(
        (d) =>
          files[d.key]?.status ===
          "error"
      ),
    [files]
  );

  const anyReading = useMemo(
    () =>
      DATASETS.some(
        (d) =>
          files[d.key]?.status ===
          "reading"
      ),
    [files]
  );

  const allUploaded =
    readyCount ===
    DATASETS.length;

  const canContinue =
    allUploaded &&
    !anyReading;

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="w-full">
      {/* PAGE TITLE */}
      <div className="mb-5">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">
          Upload / Select Railway Data
        </h1>

        <p className="mt-1 text-sm sm:text-base text-slate-500">
          Upload the datasets required to
          begin intelligent block planning.
        </p>
      </div>

      {/* STATUS + CONTINUE */}
      <div className="flex items-center justify-between mb-4">
        <div
          className="flex items-center"
          aria-live="polite"
        >
          {allUploaded ? (
            <span className="text-lg sm:text-xl font-semibold text-emerald-600 ml-2 sm:ml-3">
              All datasets uploaded
              successfully
            </span>
          ) : (
            <span className="text-lg sm:text-xl font-semibold text-slate-700 ml-2 sm:ml-3">
              {readyCount}/
              {DATASETS.length}{" "}
              Datasets Ready
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className={cn(
            "px-6 sm:px-7 py-2 sm:py-2.5 rounded-lg text-base sm:text-lg font-semibold border transition-all duration-200",

            canContinue
              ? "border-[#3a83f7] bg-[#3a83f7] text-white hover:bg-[#3275e6] hover:border-[#3275e6] shadow-sm"
              : "border-red-300 bg-transparent text-red-400 cursor-not-allowed"
          )}
        >
          Continue →
        </button>
      </div>

      {/* DATASET CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 mb-4">
        {DATASETS.map((d) => (
          <DatasetCard
            key={d.key}
            dataset={d}
            file={files[d.key]}
            isDragOver={
              cardDragOver === d.key
            }
            onDragOver={(e) => {
              e.preventDefault();
              setCardDragOver(d.key);
            }}
            onDragLeave={() =>
              setCardDragOver(null)
            }
            onDrop={(e) =>
              handleCardDrop(
                d.key,
                e
              )
            }
            onFileChange={(e) =>
              handleCardFileChange(
                d.key,
                e
              )
            }
          />
        ))}
      </div>

      {/* ERROR SUMMARY */}
      {anyErrors && (
        <div
          role="alert"
          className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4"
        >
          <AlertTriangle
            size={14}
            className="mt-0.5 shrink-0"
          />

          <span>
            Some files are missing
            expected columns. Re-check
            the export or column names
            before continuing.
          </span>
        </div>
      )}

      {/* GENERAL DRAG & DROP ZONE */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drag and drop CSV files here, or press Enter to browse"
        onClick={() =>
          zoneInputRef.current?.click()
        }
        onKeyDown={handleZoneKeyDown}
        onDragOver={(e) => {
          e.preventDefault();
          setZoneDragActive(true);
        }}
        onDragLeave={() =>
          setZoneDragActive(false)
        }
        onDrop={handleZoneDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed bg-white py-6 sm:py-8 lg:py-10 text-sm mb-4 cursor-pointer transition",

          zoneDragActive
            ? "border-indigo-400 ring-2 ring-indigo-300 bg-indigo-50/40"
            : "border-indigo-200"
        )}
      >
        <input
          ref={zoneInputRef}
          type="file"
          accept={ACCEPTED_EXTENSION}
          multiple
          className="hidden"
          onChange={(e) => {
            handleZoneFiles(
              e.target.files
            );

            e.target.value = "";
          }}
        />

        <UploadCloud
          size={22}
          className="text-indigo-400 mb-1"
        />

        <span className="text-slate-600 font-medium text-sm">
          Drag & drop CSV files here
        </span>

        <span className="text-slate-400 text-xs">
          we'll match each file to the
          right dataset automatically
        </span>
      </div>

      {/* FORMAT GUIDE */}
      <div className="flex items-center justify-between gap-3 text-sm bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-xl px-3 sm:px-4 py-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-5 h-5 rounded-full border-2 border-indigo-500 text-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
            <Info size={12} />
          </span>

          <span className="min-w-0">
            <span className="font-semibold text-slate-800 text-xs sm:text-sm">
              Supported format: CSV
            </span>

            <br />

            <span className="text-slate-500 text-[10px] sm:text-xs">
              Ensure your files match the
              required schema for accurate
              analysis.
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}