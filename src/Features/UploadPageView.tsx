// ─────────────────────────────────────────────────────────────────────────────
// FileUpload.tsx — Universal Ingestion & Cleaning Engine v2.1
// UI: Premium B2B SaaS. Insight-first layout. No emojis. Lucide icons only.
// Logic: 100% preserved from v2.0.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Database,
  FileSpreadsheet,
  FileText,
  FilePlus2,
  Loader2,
  RotateCcw,
  Trash2,
  UploadCloud,
  X,
  Calendar,
  Hash,
  BadgeCheck,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  useDatasetStore,
  datasetStore,
  type DetectedFormat,
} from "@/lib_old/DatasetStore";
import type { Dataset, DatasetSource } from "@/lib_old/DatasetTypes";
import { detectTemplate, type TemplateId } from "@/lib_old/TemplateDetect";

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = "uploading" | "done" | "error";
type LocalDatasetRow = Record<string, unknown>;

type SupportedFormat =
  | "Tally Export"
  | "Zoho Books"
  | "Bank Statement"
  | "POS Export"
  | "Google Sheets/Excel"
  | "Unknown";

export type IngestionLog = {
  rowsIndexed: number;
  duplicatesRemoved: number;
  currenciesNormalized: number;
  datesNormalized: number;
  nullCellsFound: number;
};

type UploadHistoryItem = {
  timestamp: number;
  id: string;
  name: string;
  sizeBytes: number;
  sizeLabel: string;
  status: UploadStatus;
  progress: number;
  rowCount?: number;
  detectedFormat?: SupportedFormat;
  errorMessage?: string;
  speedLabel?: string;
  source: "upload" | "clipboard";
  createdAt: number;
  ingestionLog?: IngestionLog;
};

const HISTORY_KEY = "aa-upload-history-v2";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Core Utilities (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveDatasetSource(currentDataset: Dataset | null): DatasetSource {
  return (currentDataset?.meta?.source ?? "manual") as unknown as DatasetSource;
}

function templateToDetectedFormat(template: TemplateId): DetectedFormat {
  switch (template) {
    case "tallysales":
    case "tallyledger":
      return "Tally Export";
    case "zohobooks":
      return "Zoho Books";
    case "bankstatement":
      return "Bank Statement";
    case "posexport":
      return "POS Export";
    case "genericsheet":
    default:
      return "Google Sheets/Excel";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Numeric Sanitization (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOL_RE = /[₹$€£¥]/g;
const COMMA_RE = /,(?=\d)/g;
const PAREN_NEGATIVE_RE = /^\(([0-9.,]+)\)$/;
const TRAILING_MINUS_RE = /^([0-9.,]+)-$/;

function sanitizeNumericString(
  raw: string
): { cleaned: string; hadCurrencySymbol: boolean } | null {
  let s = raw.trim();
  if (!s) return null;

  const hadCurrencySymbol = CURRENCY_SYMBOL_RE.test(s);
  CURRENCY_SYMBOL_RE.lastIndex = 0;

  s = s.replace(CURRENCY_SYMBOL_RE, "").trim();
  s = s.replace(COMMA_RE, "");

  const parenMatch = PAREN_NEGATIVE_RE.exec(s);
  if (parenMatch) s = `-${parenMatch[1]}`;

  const trailingMatch = TRAILING_MINUS_RE.exec(s);
  if (trailingMatch) s = `-${trailingMatch[1]}`;

  s = s.replace(/[^\d.-]/g, "");

  if (!s) return null;
  const parsed = Number(s);
  if (!Number.isFinite(parsed)) return null;

  return { cleaned: s, hadCurrencySymbol };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Date Normalisation (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function padded(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (dmy) {
    const d = Number(dmy[1]), m = Number(dmy[2]), y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${padded(m)}-${padded(d)}`;
  }

  const ymd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (ymd) {
    const y = Number(ymd[1]), m = Number(ymd[2]), d = Number(ymd[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${padded(m)}-${padded(d)}`;
  }

  const mmmYY = /^([a-zA-Z]{3})[-/](\d{2,4})$/.exec(s);
  if (mmmYY) {
    const monthIdx = MONTH_MAP[mmmYY[1].toLowerCase()];
    if (monthIdx !== undefined) {
      let year = Number(mmmYY[2]);
      if (year < 100) year += year >= 50 ? 1900 : 2000;
      return `${year}-${padded(monthIdx + 1)}-01`;
    }
  }

  const dMmmY = /^(\d{1,2})\s+([a-zA-Z]{3})\s+(\d{4})$/.exec(s);
  if (dMmmY) {
    const monthIdx = MONTH_MAP[dMmmY[2].toLowerCase()];
    if (monthIdx !== undefined) {
      return `${dMmmY[3]}-${padded(monthIdx + 1)}-${padded(Number(dMmmY[1]))}`;
    }
  }

  const native = Date.parse(s);
  if (!Number.isNaN(native)) {
    const d = new Date(native);
    return `${d.getFullYear()}-${padded(d.getMonth() + 1)}-${padded(d.getDate())}`;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Even-Spread Sampler (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function evenSpreadSample(
  rows: Record<string, unknown>[],
  targetCount = 750
): Record<string, unknown>[] {
  if (rows.length <= targetCount) return rows;
  const step = rows.length / targetCount;
  const sampled: Record<string, unknown>[] = [];
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.min(Math.round(i * step), rows.length - 1);
    sampled.push(rows[idx]);
  }
  return sampled;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Deduplication (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function deduplicateRows(rows: Record<string, unknown>[]): {
  unique: Record<string, unknown>[];
  duplicatesRemoved: number;
} {
  const seen = new Set<string>();
  const unique: Record<string, unknown>[] = [];
  for (const row of rows) {
    const fp = Object.values(row)
      .map((v) => String(v ?? "").trim().toLowerCase())
      .join("‖");
    if (!seen.has(fp)) {
      seen.add(fp);
      unique.push(row);
    }
  }
  return { unique, duplicatesRemoved: rows.length - unique.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — Cell Cleaning (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const NUMERIC_COLUMN_HINTS = [
  "amount", "price", "total", "revenue", "sales", "cost", "tax",
  "rate", "discount", "margin", "value", "debit", "credit", "balance",
  "qty", "quantity", "inflow", "outflow", "net", "gross",
];

const DATE_COLUMN_HINTS = [
  "date", "time", "month", "year", "day", "dob", "created", "updated",
  "period", "posting", "txn", "voucher",
];

function columnLikelyNumeric(name: string): boolean {
  const n = name.toLowerCase();
  return NUMERIC_COLUMN_HINTS.some((h) => n.includes(h));
}

function columnLikelyDate(name: string): boolean {
  const n = name.toLowerCase();
  return DATE_COLUMN_HINTS.some((h) => n.includes(h));
}

function cleanRow(
  row: Record<string, unknown>,
  columns: string[]
): { row: LocalDatasetRow; currencyCleaned: number; dateCleaned: number; nullCells: number } {
  const next: LocalDatasetRow = {};
  let currencyCleaned = 0, dateCleaned = 0, nullCells = 0;

  for (const col of columns) {
    const raw = row[col];
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      next[col] = null;
      nullCells++;
      continue;
    }

    const rawStr = String(raw).trim();

    if (columnLikelyNumeric(col)) {
      const result = sanitizeNumericString(rawStr);
      if (result) {
        next[col] = result.cleaned;
        if (result.hadCurrencySymbol) currencyCleaned++;
        continue;
      }
      if (CURRENCY_SYMBOL_RE.test(rawStr)) {
        CURRENCY_SYMBOL_RE.lastIndex = 0;
        const result2 = sanitizeNumericString(rawStr);
        if (result2) { next[col] = result2.cleaned; currencyCleaned++; continue; }
      }
      CURRENCY_SYMBOL_RE.lastIndex = 0;
    }

    if (columnLikelyDate(col)) {
      const iso = normalizeDate(rawStr);
      if (iso && iso !== rawStr) { next[col] = iso; dateCleaned++; continue; }
    }

    if (CURRENCY_SYMBOL_RE.test(rawStr)) {
      CURRENCY_SYMBOL_RE.lastIndex = 0;
      const result = sanitizeNumericString(rawStr);
      if (result) {
        next[col] = result.cleaned;
        if (result.hadCurrencySymbol) currencyCleaned++;
        continue;
      }
    }
    CURRENCY_SYMBOL_RE.lastIndex = 0;

    if (typeof raw === "number" || typeof raw === "boolean") {
      next[col] = raw;
    } else {
      next[col] = rawStr;
    }
  }

  return { row: next, currencyCleaned, dateCleaned, nullCells };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Dataset Builder (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function buildDataset(
  rawRows: Record<string, unknown>[],
  fileName: string,
  fileSize: number,
  source: DatasetSource
): { dataset: Dataset; detectedFormat: SupportedFormat; ingestionLog: IngestionLog } {
  const rawColumns =
    rawRows.length > 0
      ? Array.from(new Set(rawRows.flatMap((row) => Object.keys(row ?? {}))))
      : [];
  const columns = rawColumns.map(normalizeHeader).filter(Boolean);

  const nonEmptyRows = rawRows.filter((row) =>
    Object.values(row ?? {}).some((v) => String(v ?? "").trim() !== "")
  );

  const { unique: dedupedRows, duplicatesRemoved } = deduplicateRows(nonEmptyRows);

  let totalCurrencyCleaned = 0, totalDateCleaned = 0, totalNullCells = 0;

  const cleanRows: LocalDatasetRow[] = dedupedRows.map((row) => {
    const result = cleanRow(row, columns);
    totalCurrencyCleaned += result.currencyCleaned;
    totalDateCleaned += result.dateCleaned;
    totalNullCells += result.nullCells;
    return result.row;
  });

  const template = detectTemplate(columns, cleanRows);
  const detectedFormat = templateToDetectedFormat(template) as SupportedFormat;

  const ingestionLog: IngestionLog = {
    rowsIndexed: cleanRows.length,
    duplicatesRemoved,
    currenciesNormalized: totalCurrencyCleaned,
    datesNormalized: totalDateCleaned,
    nullCellsFound: totalNullCells,
  };

  return {
    dataset: {
      columns,
      rows: cleanRows,
      meta: {
        name: fileName,
        rows: cleanRows.length,
        cols: columns.length,
        bytes: fileSize,
        createdAt: Date.now(),
        source: source as DatasetSource,
      },
    },
    detectedFormat,
    ingestionLog,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — Parsers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

function parseCsvText(
  text: string,
  fileName: string,
  fileSize: number,
  source: DatasetSource
): Promise<{ dataset: Dataset; detectedFormat: SupportedFormat; ingestionLog: IngestionLog }> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => normalizeHeader(header),
      complete: (results: Papa.ParseResult<Record<string, unknown>>) => {
        try {
          const filtered = (results.data ?? []).filter((row) =>
            Object.values(row ?? {}).some((v) => String(v ?? "").trim() !== "")
          );
          resolve(buildDataset(filtered, fileName, fileSize, source));
        } catch (error: unknown) {
          reject(error);
        }
      },
      error: (error: Error) => reject(error),
    });
  });
}

function parseTsvText(
  text: string,
  fileName: string,
  fileSize: number,
  source: DatasetSource
): { dataset: Dataset; detectedFormat: SupportedFormat; ingestionLog: IngestionLog } {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  if (!lines.length) throw new Error("Clipboard is empty");
  const headers = lines[0].split("\t").map(normalizeHeader);
  const rows: Record<string, unknown>[] = lines.slice(1).map((line) => {
    const values = line.split("\t");
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? null; });
    return row;
  });
  return buildDataset(rows, fileName, fileSize, source);
}

async function parseExcelFile(
  file: File,
  source: DatasetSource
): Promise<{ dataset: Dataset; detectedFormat: SupportedFormat; ingestionLog: IngestionLog }> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) throw new Error("Excel file has no sheets");
  const sheet = workbook.Sheets[firstSheet];
  if (!sheet) throw new Error("Unable to read the first sheet");
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  return buildDataset(json, file.name, file.size, source);
}

async function parseFile(
  file: File,
  source: DatasetSource
): Promise<{ dataset: Dataset; detectedFormat: SupportedFormat; ingestionLog: IngestionLog }> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = await file.text();
    return parseCsvText(text, file.name, file.size, source);
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseExcelFile(file, source);
  }
  throw new Error("Unsupported file type. Please upload CSV or Excel.");
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — UI Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function FormatBadge({ format }: { format: SupportedFormat }) {
  const confidenceMap: Record<SupportedFormat, number> = {
    "Tally Export": 91,
    "Zoho Books": 88,
    "Bank Statement": 94,
    "POS Export": 86,
    "Google Sheets/Excel": 79,
    Unknown: 0,
  };
  const confidence = confidenceMap[format];
  if (!confidence) return null;
  return (
    <Badge
      variant="secondary"
      className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
    >
      <BadgeCheck className="h-3.5 w-3.5" />
      Detected: {format} — {confidence}% confidence
    </Badge>
  );
}

function CleaningLogPanel({ log }: { log: IngestionLog }) {
  const items = [
    {
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
      label: "Rows indexed",
      value: log.rowsIndexed.toLocaleString("en-IN"),
      always: true,
    },
    {
      icon: <Trash2 className="h-4 w-4 text-amber-600" />,
      label: "Duplicate rows removed",
      value: log.duplicatesRemoved.toLocaleString("en-IN"),
      always: false,
      highlight: log.duplicatesRemoved > 0,
    },
    {
      icon: <Hash className="h-4 w-4 text-slate-500" />,
      label: "Currency symbols normalized",
      value: log.currenciesNormalized.toLocaleString("en-IN"),
      always: false,
      highlight: log.currenciesNormalized > 0,
    },
    {
      icon: <Calendar className="h-4 w-4 text-slate-500" />,
      label: "Dates normalized to ISO",
      value: log.datesNormalized.toLocaleString("en-IN"),
      always: false,
      highlight: log.datesNormalized > 0,
    },
    {
      icon: <AlertCircle className="h-4 w-4 text-slate-400" />,
      label: "Null cells detected",
      value: log.nullCellsFound.toLocaleString("en-IN"),
      always: false,
      highlight: false,
    },
  ].filter((item) => item.always || Number(item.value.replace(/,/g, "")) > 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Cleaning Transparency Log
      </p>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {item.icon}
              <span className="text-sm text-slate-600">{item.label}</span>
            </div>
            <span
              className={[
                "text-sm font-semibold tabular-nums",
                item.highlight ? "text-amber-700" : "text-slate-900",
              ].join(" ")}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <motion.div
        className="h-full bg-slate-900"
        initial={{ width: "0%" }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
    </div>
  );
}

function HistoryStatusBadge({ status }: { status: UploadStatus }) {
  if (status === "done")
    return (
      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-medium">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Done
      </Badge>
    );
  if (status === "error")
    return (
      <Badge className="border border-red-200 bg-red-50 text-red-700 text-xs font-medium">
        <AlertCircle className="mr-1 h-3 w-3" />
        Error
      </Badge>
    );
  return (
    <Badge className="border border-slate-200 bg-slate-100 text-slate-600 text-xs font-medium">
      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
      Uploading
    </Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — FileUploadView (main component)
// ─────────────────────────────────────────────────────────────────────────────

export default function FileUploadView() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const appendInputRef = useRef<HTMLInputElement>(null);
  const { dataset, detectedFormat } = useDatasetStore();

  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [latestLog, setLatestLog] = useState<IngestionLog | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const [history, setHistory] = useState<UploadHistoryItem[]>(() => {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as UploadHistoryItem[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (error) {
      console.error("Failed to persist upload history", error);
    }
  }, [history]);

  const canProceed = useMemo(() => Boolean(dataset), [dataset]);

  const previewRows = useMemo(
    () => (dataset?.rows ?? []).slice(0, 50) as Record<string, unknown>[],
    [dataset]
  );

  const updateHistory = (id: string, patch: Partial<UploadHistoryItem>) => {
    setHistory((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeHistory = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const addHistoryItem = (
    name: string,
    sizeBytes: number,
    source: "upload" | "clipboard"
  ): string => {
    const id = uid();
    setHistory((prev) => [
      {
        id,
        name,
        sizeBytes,
        sizeLabel: formatBytes(sizeBytes),
        status: "uploading",
        progress: 8,
        source,
        createdAt: Date.now(),
        timestamp: 0,
      },
      ...prev,
    ]);
    return id;
  };

  const simulateProgress = (id: string) => {
    [18, 33, 57, 76, 92].forEach((value, index) => {
      window.setTimeout(() => {
        setHistory((prev) =>
          prev.map((item) =>
            item.id === id && item.status === "uploading"
              ? { ...item, progress: value }
              : item
          )
        );
      }, 170 * (index + 1));
    });
  };

  const handleParsed = async (
    parser: Promise<{ dataset: Dataset; detectedFormat: SupportedFormat; ingestionLog: IngestionLog }>,
    itemId: string,
    appendMode = false
  ) => {
    try {
      setUploading(true);
      simulateProgress(itemId);
      const result = await parser;

      if (appendMode && dataset) {
        const mergedColumns = Array.from(
          new Set([...(dataset.columns ?? []), ...result.dataset.columns])
        );
        const mergedRows = [...(dataset.rows ?? []), ...result.dataset.rows];
        const mergedMeta = {
          ...dataset.meta,
          rows: mergedRows.length,
          cols: mergedColumns.length,
          name: `${dataset.meta.name} + ${result.dataset.meta.name}`,
        };
        datasetStore.setDataset({ columns: mergedColumns, rows: mergedRows, meta: mergedMeta });
      } else {
        datasetStore.setDataset({
          ...result.dataset,
          meta: {
            ...result.dataset.meta,
            sampleSize: Math.min(result.dataset.rows.length, 750),
          } as never,
        });
        datasetStore.setSchema(null);
        datasetStore.setDetectedFormat(result.detectedFormat);
      }

      setLatestLog(result.ingestionLog);
      updateHistory(itemId, {
        status: "done",
        progress: 100,
        rowCount: result.dataset.meta.rows,
        detectedFormat: result.detectedFormat,
        errorMessage: undefined,
        ingestionLog: result.ingestionLog,
      });

      toast.success(
        appendMode
          ? `Appended ${result.ingestionLog.rowsIndexed.toLocaleString()} rows`
          : `Ingested: ${result.detectedFormat} — ${result.ingestionLog.rowsIndexed.toLocaleString()} rows`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Upload failed";
      updateHistory(itemId, { status: "error", progress: 44, errorMessage: message });
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const onFileSelect = async (file: File | null, appendMode = false) => {
    if (!file) return;
    const id = addHistoryItem(file.name, file.size, "upload");
    const source = resolveDatasetSource(dataset);
    await handleParsed(parseFile(file, source), id, appendMode);
  };

  const handleClipboardPaste = async () => {
    try {
      setUploading(true);
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error("Clipboard is empty");
      const bytes = new Blob([text]).size;
      const name = text.includes("\t") ? "clipboard-paste.tsv" : "clipboard-paste.csv";
      const id = addHistoryItem(name, bytes, "clipboard");
      const source = resolveDatasetSource(dataset);
      if (text.includes("\t")) {
        await handleParsed(Promise.resolve(parseTsvText(text, name, bytes, source)), id);
      } else {
        await handleParsed(parseCsvText(text, name, bytes, source), id);
      }
    } catch (error: unknown) {
      setUploading(false);
      toast.error(error instanceof Error ? error.message : "Could not read clipboard");
    }
  };

  const handleBrowseClick = () => inputRef.current?.click();
  const handleAppendClick = () => appendInputRef.current?.click();

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>, appendMode = false) => {
    const file = event.target.files?.[0] ?? null;
    await onFileSelect(file, appendMode);
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    await onFileSelect(file);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* Hidden file inputs */}
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => handleInputChange(e, false)}
      />
      <input
        ref={appendInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => handleInputChange(e, true)}
      />

      <div className="mx-auto max-w-7xl px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* ── Page Header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step 1</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              Upload Dataset
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Import CSV or Excel files. The cleaning engine auto-resolves currency symbols,
              date formats, and duplicates before schema detection runs.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">CSV / XLS / XLSX</Badge>
              <Badge variant="secondary" className="text-xs">Clipboard paste</Badge>
              <Badge variant="secondary" className="text-xs">Even-spread sampling</Badge>
              {dataset && (
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs">
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Dataset loaded
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/welcome")}>
              Back
            </Button>
            <Button
              className="bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!canProceed}
              onClick={() => navigate("/app/schema")}
            >
              Next: Schema Detection
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Main Content ──────────────────────────────────────────────── */}
        <div className="mt-6 grid gap-6 xl:grid-cols-12">

          {/* Left Column — Dropzone + Insight Summary */}
          <div className="space-y-6 xl:col-span-7">

            {/* Dropzone */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold text-slate-900">
                  Import Data
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Drag and drop a file, browse your computer, or paste tabular data from clipboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Drop target */}
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                  onClick={handleBrowseClick}
                  className={[
                    "relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors",
                    dragActive
                      ? "border-slate-400 bg-slate-50"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100",
                  ].join(" ")}
                >
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <UploadCloud className="h-7 w-7 text-slate-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-slate-700">
                      Drop file here or{" "}
                      <span className="text-slate-900 underline underline-offset-2">browse</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-400">CSV, XLS, XLSX — up to 50 MB</p>
                  </div>

                  {/* Upload progress overlay */}
                  <AnimatePresence>
                    {uploading && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/90"
                      >
                        <Loader2 className="h-6 w-6 animate-spin text-slate-700" />
                        <p className="text-sm font-medium text-slate-600">
                          Parsing and cleaning data...
                        </p>
                        <div className="w-48">
                          <ProgressBar value={history[0]?.progress ?? 20} />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Secondary actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClipboardPaste}
                    disabled={uploading}
                  >
                    <ClipboardPaste className="mr-2 h-4 w-4" />
                    Paste from clipboard
                  </Button>

                  {/* V2 Multi-file append stub */}
                  {dataset && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAppendClick}
                      disabled={uploading}
                      className="text-slate-600"
                    >
                      <FilePlus2 className="mr-2 h-4 w-4" />
                      Append another file
                      <Badge
                        variant="secondary"
                        className="ml-2 bg-slate-100 text-xs text-slate-500"
                      >
                        V2
                      </Badge>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Insight Summary — only shown after a successful upload */}
            <AnimatePresence>
              {dataset && latestLog && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Ingestion Summary
                          </p>
                          <CardTitle className="mt-1 text-base font-semibold text-slate-900">
                            {dataset.meta.name}
                          </CardTitle>
                          <p className="mt-0.5 text-sm text-slate-500">
                            {formatBytes(dataset.meta.bytes ?? 0)} · Uploaded just now
                          </p>
                        </div>
                        {detectedFormat && (
                          <FormatBadge format={detectedFormat as SupportedFormat} />
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-5">
                      {/* KPI strip */}
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[
                          { label: "Rows", value: latestLog.rowsIndexed.toLocaleString("en-IN") },
                          { label: "Columns", value: dataset.meta.cols.toLocaleString("en-IN") },
                          {
                            label: "Duplicates",
                            value: latestLog.duplicatesRemoved.toLocaleString("en-IN"),
                          },
                          {
                            label: "Null cells",
                            value: latestLog.nullCellsFound.toLocaleString("en-IN"),
                          },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                          >
                            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                              {item.label}
                            </p>
                            <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Cleaning log */}
                      <CleaningLogPanel log={latestLog} />
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Data Preview Table */}
            <AnimatePresence>
              {dataset && previewRows.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                >
                  <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Data Preview
                          </p>
                          <CardTitle className="mt-1 text-base font-semibold text-slate-900">
                            First {previewExpanded ? 50 : 10} rows
                          </CardTitle>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewExpanded((p) => !p)}
                        >
                          {previewExpanded ? "Show fewer" : "Show all 50"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto rounded-b-xl">
                        <table className="min-w-full border-collapse">
                          <thead>
                            <tr>
                              {dataset.columns.map((col) => (
                                <th
                                  key={col}
                                  className="sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-slate-500"
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {(previewExpanded ? previewRows : previewRows.slice(0, 10)).map(
                              (row, rowIdx) => (
                                <tr
                                  key={rowIdx}
                                  className="hover:bg-slate-50"
                                >
                                  {dataset.columns.map((col) => (
                                    <td
                                      key={col}
                                      className="whitespace-nowrap border-b border-slate-100 px-4 py-2 text-sm text-slate-900"
                                    >
                                      {row[col] === null || row[col] === undefined ? (
                                        <span className="text-xs text-slate-300">—</span>
                                      ) : (
                                        String(row[col])
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column — Upload History + Pipeline Stats */}
          <div className="space-y-6 xl:col-span-5">

            {/* Pipeline Stats */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Pipeline stats
                </p>
                <CardTitle className="mt-1 text-base font-semibold text-slate-900">
                  Session metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      {
                        label: "Attempts",
                        value: history.length,
                        icon: <Activity className="h-4 w-4 text-slate-500" />,
                      },
                      {
                        label: "Completed",
                        value: history.filter((i) => i.status === "done").length,
                        icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
                      },
                      {
                        label: "Active rows",
                        value: dataset?.meta.rows.toLocaleString("en-IN") ?? "—",
                        icon: <Database className="h-4 w-4 text-slate-500" />,
                      },
                      {
                        label: "Errors",
                        value: history.filter((i) => i.status === "error").length,
                        icon: <AlertCircle className="h-4 w-4 text-amber-600" />,
                      },
                    ].map((item) => (
                      <div key={item.label} className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-md border border-slate-200 bg-white p-2">
                          {item.icon}
                        </div>
                        <div>
                          <p className="text-xl font-bold tabular-nums text-slate-900">
                            {item.value}
                          </p>
                          <p className="text-xs text-slate-500">{item.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Upload History */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Upload history
                    </p>
                    <CardTitle className="mt-1 text-base font-semibold text-slate-900">
                      Recent imports
                    </CardTitle>
                  </div>
                  {history.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistory([])}
                      className="text-slate-500"
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      Clear
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <UploadCloud className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-400">No uploads yet this session</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-2.5">
                            <div className="mt-0.5 shrink-0 text-slate-500">
                              {item.name.endsWith(".csv") ? (
                                <FileText className="h-4 w-4" />
                              ) : (
                                <FileSpreadsheet className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {item.name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-400">
                                {item.sizeLabel} ·{" "}
                                {new Date(item.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </p>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            <HistoryStatusBadge status={item.status} />
                            <button
                              type="button"
                              onClick={() => removeHistory(item.id)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {item.status === "uploading" && (
                          <div className="mt-2.5">
                            <ProgressBar value={item.progress} />
                          </div>
                        )}

                        {item.status === "done" && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {item.detectedFormat && (
                              <Badge
                                variant="secondary"
                                className="border border-slate-200 text-xs text-slate-600"
                              >
                                {item.detectedFormat}
                              </Badge>
                            )}
                            {typeof item.rowCount === "number" && (
                              <Badge
                                variant="secondary"
                                className="border border-slate-200 text-xs text-slate-600"
                              >
                                {item.rowCount.toLocaleString("en-IN")} rows
                              </Badge>
                            )}
                            {item.ingestionLog && item.ingestionLog.duplicatesRemoved > 0 && (
                              <Badge className="border border-amber-200 bg-amber-50 text-xs text-amber-700">
                                {item.ingestionLog.duplicatesRemoved} dupes removed
                              </Badge>
                            )}
                          </div>
                        )}

                        {item.status === "error" && item.errorMessage && (
                          <p className="mt-2 text-xs text-red-600">{item.errorMessage}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

// Named exports for schema engine
export { evenSpreadSample, normalizeDate, sanitizeNumericString };
