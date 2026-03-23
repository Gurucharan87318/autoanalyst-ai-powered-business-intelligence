// ─────────────────────────────────────────────────────────────────────────────
// FileUpload.tsx — Universal Ingestion & Cleaning Engine v2.1
// UI: Premium B2B SaaS. Insight-first layout. No emojis. Lucide icons only.
// Logic: 100% preserved from v2.0. Sample datasets added safely inside component.
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

// ─── Sample Datasets (module-level constant — safe, no component scope needed) ──

const SAMPLE_DATASETS: {
  name: string;
  filename: string;
  description: string;
  csv: string;
}[] = [
  {
    name: "Sales Sample",
    filename: "sample-sales.csv",
    description: "Revenue · Customer · Product · Region",
    csv: `Date,Customer,Product,Revenue,Region
2026-01-01,Acme Corp,Widget A,1200,South
2026-01-02,Zen Labs,Widget B,980,North
2026-01-03,Acme Corp,Widget C,1450,South
2026-01-04,Orbit Pvt Ltd,Widget A,2100,West
2026-01-05,Nova Retail,Widget B,760,East
2026-01-06,Zen Labs,Widget C,890,North
2026-01-07,Acme Corp,Widget A,1340,South`,
  },
  {
    name: "Bank Statement",
    filename: "sample-bank.csv",
    description: "Date · Debit · Credit · Balance · Narration",
    csv: `Date,Narration,Debit,Credit,Balance
2026-01-01,Opening Balance,,5000,5000
2026-01-02,Office Supplies,450,,4550
2026-01-03,Client Payment,,1800,6350
2026-01-04,Rent,2500,,3850
2026-01-05,Subscription,299,,3551
2026-01-06,Travel Reimbursement,,1200,4751
2026-01-07,Vendor Payment,3200,,1551`,
  },
];

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
// SECTION 9 — UI Sub-components (unchanged)
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
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center justify-center rounded-lg border border-slate-100 bg-slate-50 px-2 py-3 text-center"
        >
          <div className="mb-1">{item.icon}</div>
          <p className="text-sm font-bold text-slate-900">{item.value}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — FileUploadView Component
// ─────────────────────────────────────────────────────────────────────────────

export default function FileUploadView() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const { dataset, detectedFormat } = useDatasetStore();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [latestLog, setLatestLog] = useState<IngestionLog | null>(null);
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

  // ── History helpers ──────────────────────────────────────────────────────

  const updateHistory = (id: string, patch: Partial<UploadHistoryItem>) => {
    setHistory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeHistory = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const clearHistory = () => setHistory([]);

  const addHistoryItem = (
    name: string,
    sizeBytes: number,
    source: "upload" | "clipboard"
  ): string => {
    const id = uid();
    const item: UploadHistoryItem = {
      id,
      name,
      sizeBytes,
      sizeLabel: formatBytes(sizeBytes),
      status: "uploading",
      progress: 8,
      speedLabel: "",
      source,
      createdAt: Date.now(),
      timestamp: 0,
    };
    setHistory((prev) => [item, ...prev]);
    return id;
  };

  const simulateProgress = (id: string) => {
    const checkpoints = [18, 33, 57, 76, 92];
    checkpoints.forEach((value, index) => {
      setTimeout(() => {
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

  // ── Core parse handler ───────────────────────────────────────────────────

  const handleParsed = async (
    parser: Promise<{
      dataset: Dataset;
      detectedFormat: SupportedFormat;
      ingestionLog: IngestionLog;
    }>,
    itemId: string
  ) => {
    try {
      setUploading(true);
      simulateProgress(itemId);
      const result = await parser;

      datasetStore.setDataset({
        ...result.dataset,
        meta: {
          ...result.dataset.meta,
          sampleSize: Math.min(result.dataset.rows.length, 750),
        } as never,
      });
      datasetStore.setSchema(null);
      datasetStore.setDetectedFormat(result.detectedFormat);
      setLatestLog(result.ingestionLog);
      updateHistory(itemId, {
        status: "done",
        progress: 100,
        rowCount: result.dataset.meta.rows,
        detectedFormat: result.detectedFormat,
        errorMessage: undefined,
        speedLabel: undefined,
        ingestionLog: result.ingestionLog,
      });
      toast.success(
        `Ingested ${result.detectedFormat} — ${result.ingestionLog.rowsIndexed.toLocaleString()} rows`
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Upload failed";
      updateHistory(itemId, { status: "error", progress: 44, errorMessage: message });
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  // ── File select ──────────────────────────────────────────────────────────

  const onFileSelect = async (file: File | null) => {
    if (!file) return;
    const id = addHistoryItem(file.name, file.size, "upload");
    const source = resolveDatasetSource(dataset);
    await handleParsed(parseFile(file, source), id);
  };

  // ── Sample dataset loader (INSIDE component — accesses parseCsvText, handleParsed, addHistoryItem) ──

  const loadSampleDataset = async (csv: string, filename: string) => {
    const id = addHistoryItem(filename, csv.length, "upload");
    const source = resolveDatasetSource(dataset);
    await handleParsed(parseCsvText(csv, filename, csv.length, source), id);
  };

  // ── Clipboard paste ──────────────────────────────────────────────────────

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
        await handleParsed(
          Promise.resolve(parseTsvText(text, name, bytes, source)),
          id
        );
      } else {
        await handleParsed(parseCsvText(text, name, bytes, source), id);
      }
    } catch (error: unknown) {
      setUploading(false);
      toast.error(error instanceof Error ? error.message : "Could not read clipboard");
    }
  };

  const retryFailed = (item: UploadHistoryItem) => {
    if (item.source === "clipboard") {
      void handleClipboardPaste();
      return;
    }
    toast.message("Please re-select the file to retry");
  };

  const handleBrowseClick = () => inputRef.current?.click();

  const handleInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    await onFileSelect(file);
    event.target.value = "";
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    await onFileSelect(file);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* ── Page Header ──────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">Step 1</div>
            <h1 className="mt-1 text-3xl tracking-tight text-slate-900">Upload Dataset</h1>
            <p className="mt-2 text-sm text-slate-500">
              Import CSV or Excel files. The cleaning engine auto-resolves currency symbols, date
              formats, and duplicates before schema detection runs.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary">CSV · XLS · XLSX</Badge>
              <Badge variant="secondary">Clipboard paste supported</Badge>
              <Badge variant="secondary">Even-Spread Sampling</Badge>
              {dataset && <Badge variant="outline">Ready for schema detection</Badge>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/welcome")}>
              Back
            </Button>
            <Button
              onClick={() => navigate("/app/schema")}
              disabled={!canProceed}
              className="bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next Schema Detection
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* ── Drop Zone ────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut", delay: 0.05 }}
          className={`mt-6 rounded-xl border-2 border-dashed bg-white p-10 text-center shadow-sm transition-all duration-200 ${
            dragActive
              ? "border-[#2185fb] bg-[#eef5ff] ring-4 ring-[#2185fb]/10 scale-[1.01]"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <UploadCloud className="mx-auto h-10 w-10 text-slate-500" />
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
            Upload your dataset
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Drag and drop CSV, XLS, or XLSX files, or paste tabular data from clipboard.
            The ingestion pipeline auto-cleans common analyst muck.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={handleBrowseClick}
              disabled={uploading}
              className="bg-slate-900 text-white hover:bg-slate-800"
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Choose file
            </Button>
            <Button
              variant="outline"
              onClick={() => void handleClipboardPaste()}
              disabled={uploading}
            >
              <ClipboardPaste className="mr-2 h-4 w-4" />
              Paste from clipboard
            </Button>
          </div>

          {uploading && (
            <div className="mt-6 flex items-center justify-center gap-1.5">
              {Array.from({ length: 5 }).map((_, index) => (
                <motion.span
                  key={index}
                  className="h-2.5 w-2.5 rounded-full bg-[#2185fb]"
                  animate={{ y: [0, -6, 0], opacity: [0.45, 1, 0.45] }}
                  transition={{
                    duration: 0.7,
                    repeat: Number.POSITIVE_INFINITY,
                    delay: index * 0.08,
                    ease: "easeInOut",
                  }}
                />
              ))}
              <span className="ml-2 text-xs font-medium text-slate-500">
                Parsing & cleaning data...
              </span>
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={handleInputChange}
          />
        </motion.div>

        {/* ── Sample Datasets Table (hidden once a dataset is loaded) ────── */}
        <AnimatePresence>
          {!dataset && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Card className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <FilePlus2 className="h-4 w-4 text-slate-400" />
                    <CardTitle className="text-sm font-semibold text-slate-900">
                      Try a sample dataset
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs text-slate-500">
                    Don't have a file? Load one of these demos to walk through the full Schema → SQL → Visuals flow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-left">
                      <thead>
                        <tr>
                          {["Dataset", "Columns", "Rows", ""].map((h) => (
                            <th
                              key={h}
                              className="border-b border-slate-100 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {SAMPLE_DATASETS.map((sample) => (
                          <tr
                            key={sample.filename}
                            className="transition-colors hover:bg-slate-50/60"
                          >
                            <td className="px-5 py-3.5">
                              <p className="text-sm font-medium text-slate-900">{sample.name}</p>
                              <p className="mt-0.5 text-xs text-slate-500">{sample.description}</p>
                            </td>
                            <td className="px-5 py-3.5 text-sm text-slate-600">
                              {sample.csv.split("\n")[0].split(",").length}
                            </td>
                            <td className="px-5 py-3.5 text-sm text-slate-600">
                              {sample.csv.trim().split("\n").length - 1}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <Button
                                size="sm"
                                className="bg-slate-900 text-white hover:bg-slate-800"
                                disabled={uploading}
                                onClick={() =>
                                  void loadSampleDataset(sample.csv, sample.filename)
                                }
                              >
                                Upload this sample
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Active Dataset Card ──────────────────────────────────────── */}
        <AnimatePresence>
          {dataset && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: "easeOut", delay: 0.08 }}
              className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div>
                  <div className="text-xs font-semibold uppercase text-slate-500">
                    Current dataset
                  </div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                    {dataset.meta.name}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {dataset.meta.rows.toLocaleString()} rows ·{" "}
                    {dataset.meta.cols} columns ·{" "}
                    {formatBytes(dataset.meta.bytes ?? 0)}
                  </div>
                  {latestLog && <CleaningLogPanel log={latestLog} />}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {detectedFormat && <FormatBadge format={detectedFormat as SupportedFormat} />}
                  <Badge variant="outline">Loaded successfully</Badge>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Upload History ───────────────────────────────────────────── */}
        <Card className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-100">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="tracking-tight text-slate-900">Upload history</CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Recent uploads and clipboard imports with ingestion log per file.
                </CardDescription>
              </div>
              {history.length > 0 && (
                <Button variant="outline" size="sm" onClick={clearHistory}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {history.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No uploads yet this session
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: index * 0.03 }}
                    className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      {item.name.toLowerCase().endsWith(".csv") ||
                      item.name.toLowerCase().endsWith(".xlsx") ||
                      item.name.toLowerCase().endsWith(".xls") ? (
                        <FileSpreadsheet className="h-6 w-6 shrink-0 text-slate-500" />
                      ) : (
                        <FileText className="h-6 w-6 shrink-0 text-slate-500" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">
                          {item.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.sizeLabel} ·{" "}
                          {new Date(item.createdAt ?? item.timestamp).toLocaleString()}
                        </div>

                        {/* Progress bar */}
                        <div className="mt-2 h-1.5 w-56 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              item.status === "error"
                                ? "bg-[#e8702a]"
                                : item.status === "done"
                                ? "bg-[#2185fb]"
                                : "bg-slate-700"
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>

                        {/* Status badges */}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          {item.status === "done" && (
                            <span className="inline-flex items-center rounded-full border border-[#d8e6fb] bg-[#eef5ff] px-2 py-1 text-[#1d4ed8]">
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              Done
                            </span>
                          )}
                          {item.status === "uploading" && (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700">
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              Processing {item.progress}%
                            </span>
                          )}
                          {item.status === "error" && (
                            <span className="inline-flex items-center rounded-full border border-[#f4dac8] bg-[#fff4ec] px-2 py-1 text-[#c2410c]">
                              <AlertCircle className="mr-1 h-3.5 w-3.5" />
                              Error
                            </span>
                          )}
                          {item.detectedFormat && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700">
                              {item.detectedFormat}
                            </span>
                          )}
                          {typeof item.rowCount === "number" && (
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700">
                              {item.rowCount.toLocaleString()} rows
                            </span>
                          )}
                        </div>

                        {item.errorMessage && (
                          <div className="mt-2 text-xs text-[#c2410c]">
                            {item.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {item.status === "error" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => retryFailed(item)}
                        >
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Retry
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeHistory(item.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

// ─── Named exports for schema engine ─────────────────────────────────────────
export { evenSpreadSample, normalizeDate, sanitizeNumericString };
