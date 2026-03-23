// ─────────────────────────────────────────────────────────────────────────────
// SchemaDetectionView.tsx  —  AutoAnalyst Smart Schema Detection Module  v3.0
// Redesigned UI: Dataset Intelligence → Data Health Alerts → Column Grid
// Pipeline: Store Sync → Even-Spread Sample → DNA Inference → Outlier Scan
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Database,
  Fingerprint,
  Hash,
  Info,
  Layers,
  Loader2,
  ScanLine,
  ShieldCheck,
  Sigma,
  ToggleLeft,
  TrendingUp,
  Type,
} from "lucide-react";
import { toast } from "sonner";

import datasetStore, { useDatasetStore } from "@/lib_old/DatasetStore";
import type { ColumnProfile, Dataset } from "@/lib_old/DatasetTypes";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { evenSpreadSample } from "./FileUpload";

// ─── Types ────────────────────────────────────────────────────────────────────

type SchemaKind = "string" | "number" | "date" | "boolean" | "currency";

type DnaRole =
  | "Date Anchor"
  | "Primary Metric"
  | "Secondary Metric"
  | "Category"
  | "Identity"
  | "Boolean Flag"
  | "Unknown";

type MappingKind = "metric" | "dimension" | "time";

type BusinessPattern =
  | "Cashflow / Bank Ledger"
  | "POS / Retail Sales"
  | "Accounts Receivable"
  | "General Enterprise"
  | null;

type DatasetRow = Record<string, unknown>;

type SortField = "name" | "nullPct" | "distinct" | "role";
type SortDir = "asc" | "desc";

// ─── Core Value Utilities ─────────────────────────────────────────────────────

function isNullish(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function scrubNumeric(v: unknown): number | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  let s = raw.replace(/[₹$€£¥]/g, "").replace(/,/g, "").trim();
  const pm = /^\(([0-9.]+)\)$/.exec(s);
  if (pm) s = `-${pm[1]}`;
  const tm = /^([0-9.]+)-$/.exec(s);
  if (tm) s = `-${tm[1]}`;
  s = s.replace(/[^\d.-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function tryParseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d;
  }
  const ymd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (ymd) { const d = new Date(s.replace(/\//g, "-")); if (!isNaN(d.getTime())) return d; }
  const mmmYY = /^([a-zA-Z]{3})[-/](\d{2,4})$/.exec(s);
  if (mmmYY) { const d = new Date(`${mmmYY[1]} 1, ${mmmYY[2]}`); if (!isNaN(d.getTime())) return d; }
  const native = Date.parse(s);
  if (!isNaN(native)) return new Date(native);
  return null;
}

function looksBoolean(v: string): boolean {
  return ["true", "false", "yes", "no", "0", "1"].includes(v.trim().toLowerCase());
}

// ─── Statistics ───────────────────────────────────────────────────────────────

function computeVarianceScore(values: number[]): number {
  if (values.length < 4) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.min(1, Math.sqrt(variance) / Math.max(1, Math.abs(mean)));
}

function computeMedian(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid]! : ((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function numStats(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const median = computeMedian(values);
  return { min, max, avg, median };
}

// ─── DNA Inference Engine ─────────────────────────────────────────────────────

function inferDnaRole(values: unknown[], uniqueCount: number) {
  const nonNull = values.filter((v) => !isNullish(v));
  if (nonNull.length === 0) return { dnaRole: "Unknown" as DnaRole, inferredType: "string" as SchemaKind };
  const strs = nonNull.map((v) => String(v).trim());

  // Temporal
  const parsedDates = strs.map((s) => tryParseDate(s)).filter(Boolean);
  const dateDensity = parsedDates.length / nonNull.length;
  if (dateDensity >= 0.7) return { dnaRole: "Date Anchor" as DnaRole, inferredType: "date" as SchemaKind, dateDensity };

  // Numeric
  const numericValues = strs.map(scrubNumeric).filter((v): v is number => v !== null);
  const numericRatio = numericValues.length / nonNull.length;
  if (numericRatio >= 0.7) {
    const varScore = computeVarianceScore(numericValues);
    const stats = numStats(numericValues);
    const hasCurrency = /[₹$€£¥]/.test(strs.join(""));
    const type: SchemaKind = hasCurrency ? "currency" : "number";
    const dnaRole: DnaRole = varScore >= 0.3 ? "Primary Metric" : "Secondary Metric";
    return { dnaRole, inferredType: type, varianceScore: varScore, numStats: stats };
  }

  // Boolean
  if (strs.filter(looksBoolean).length / nonNull.length >= 0.8) {
    return { dnaRole: "Boolean Flag" as DnaRole, inferredType: "boolean" as SchemaKind };
  }

  if (uniqueCount <= 15) return { dnaRole: "Category" as DnaRole, inferredType: "string" as SchemaKind };
  if (uniqueCount > 20) return { dnaRole: "Identity" as DnaRole, inferredType: "string" as SchemaKind };
  return { dnaRole: "Unknown" as DnaRole, inferredType: "string" as SchemaKind };
}

function dnaRoleToMapping(role: DnaRole): MappingKind {
  if (role === "Date Anchor") return "time";
  if (role === "Primary Metric" || role === "Secondary Metric") return "metric";
  return "dimension";
}

// ─── Business Pattern ─────────────────────────────────────────────────────────

function normColName(s: string) { return s.toLowerCase().replace(/\s+/g, ""); }
function hasColumn(cols: string[], hints: string[]) {
  return cols.some((c) => hints.some((h) => normColName(c).includes(h)));
}

function detectBusinessPattern(columns: string[]): BusinessPattern {
  const hasDate = hasColumn(columns, ["date", "time", "period", "txndate", "postingdate"]);
  const hasDebit = hasColumn(columns, ["debit", "dr", "withdrawal", "outflow"]);
  const hasCredit = hasColumn(columns, ["credit", "cr", "deposit", "inflow"]);
  if (hasDate && hasDebit && hasCredit) return "Cashflow / Bank Ledger";
  const hasItem = hasColumn(columns, ["item", "product", "sku", "stockitem"]);
  const hasPayment = hasColumn(columns, ["paymentmode", "mode", "tender", "payment"]);
  const hasAmount = hasColumn(columns, ["amount", "total", "billamount", "nettotal"]);
  if (hasDate && hasItem && hasAmount && hasPayment) return "POS / Retail Sales";
  const hasCustomer = hasColumn(columns, ["customer", "client", "party", "contact"]);
  const hasInvoice = hasColumn(columns, ["invoice", "invoiceno", "billno", "voucherno"]);
  const hasOutstanding = hasColumn(columns, ["outstanding", "balancedue", "receivable", "amountdue"]);
  if (hasCustomer && hasInvoice && hasOutstanding) return "Accounts Receivable";
  return "General Enterprise";
}

// ─── Full Column Builder (store-compatible) ───────────────────────────────────

function buildDnaColumns(dataset: Dataset): ColumnProfile[] {
  const allRows = dataset.rows as DatasetRow[];
  const rowCount = allRows.length;
  const sampleRows = evenSpreadSample(allRows, 750) as DatasetRow[];

  return dataset.columns.map((column) => {
    const allValues = allRows.map((r) => r[column]);
    const sampleValues = sampleRows.map((r) => r[column]);
    const nullCount = allValues.filter(isNullish).length;
    const nullPct = rowCount ? (nullCount / rowCount) * 100 : 0;
    const uniqueSet = new Set(
      allValues.filter((v) => !isNullish(v)).map((v) => String(v).trim().toLowerCase())
    );
    const uniqueCount = uniqueSet.size;
    const dna = inferDnaRole(sampleValues, uniqueCount);
    const sampleValue = sampleValues.find((v) => !isNullish(v));

    return {
      name: column,
      inferredType: dna.inferredType,
      guessedType: dna.inferredType,
      assignedType: dna.inferredType,
      nullCount,
      nullPct,
      uniqueCount,
      distinctCount: uniqueCount,
      cardinality: rowCount ? uniqueCount / rowCount : 0,
      sampleValue: sampleValue != null ? String(sampleValue) : "—",
      sampleValues: sampleValues.filter((v) => !isNullish(v)).slice(0, 3).map((v) => String(v)),
      dnaRole: dna.dnaRole,
      varianceScore: (dna as any).varianceScore,
      dateDensity: (dna as any).dateDensity,
      numericMin: (dna as any).numStats?.min,
      numericMax: (dna as any).numStats?.max,
      numericAvg: (dna as any).numStats?.avg,
      numericMedian: (dna as any).numStats?.median,
    } as ColumnProfile & Record<string, unknown>;
  });
}

// ─── Enhanced Column (UI model) ───────────────────────────────────────────────

type EnhancedColumn = {
  base: ColumnProfile & {
    dnaRole?: DnaRole;
    varianceScore?: number;
    dateDensity?: number;
    numericMin?: number;
    numericMax?: number;
    numericAvg?: number;
    numericMedian?: number;
  };
  dnaRole: DnaRole;
  mapping: MappingKind;
  anomalyFlags: string[];
  sqlReady: boolean;
  sanitizedSample: string;
  numericStats?: { min: number; max: number; avg: number; median: number };
  varianceScore?: number;
  dateDensity?: number;
};

function buildEnhancedColumns(cols: ColumnProfile[], rowCount: number): EnhancedColumn[] {
  return cols.map((col) => {
    const base = col as EnhancedColumn["base"];
    const assignedType = String(base.assignedType ?? base.inferredType ?? "string") as SchemaKind;
    const distinctCount = Number(base.uniqueCount ?? base.distinctCount ?? 0);
    const nullPct = Number(base.nullPct ?? 0);
    const sample = String(base.sampleValue ?? base.sampleValues?.[0] ?? "—");
    const dnaRole: DnaRole = (base.dnaRole as DnaRole) ?? "Unknown";
    const mapping = dnaRoleToMapping(dnaRole);

    const anomalyFlags: string[] = [];
    if (nullPct > 40) anomalyFlags.push("High nulls >40%");
    else if (nullPct > 20) anomalyFlags.push("Moderate nulls >20%");
    if (distinctCount === 1 && rowCount > 1) anomalyFlags.push("Single value");
    if (distinctCount === 0) anomalyFlags.push("No data");
    if (dnaRole === "Unknown") anomalyFlags.push("Ambiguous type");
    if (assignedType === "date" && (base.dateDensity ?? 0) < 0.7) anomalyFlags.push("Low date density");

    let sanitizedSample = sample;
    if (assignedType === "number" || assignedType === "currency") {
      const n = scrubNumeric(sample);
      if (n !== null) sanitizedSample = n.toLocaleString("en-IN");
    }

    const ns =
      base.numericMin !== undefined && base.numericMax !== undefined && base.numericAvg !== undefined
        ? { min: base.numericMin, max: base.numericMax, avg: base.numericAvg, median: (base as any).numericMedian ?? base.numericAvg }
        : undefined;

    return {
      base,
      dnaRole,
      mapping,
      anomalyFlags,
      sqlReady: assignedType !== "string" || mapping === "dimension",
      sanitizedSample,
      numericStats: ns,
      varianceScore: base.varianceScore,
      dateDensity: base.dateDensity,
    };
  });
}

// ─── Outlier Detection ────────────────────────────────────────────────────────

type OutlierAlert = {
  column: string;
  value: number;
  typicalMin: number;
  typicalMax: number;
  severity: "high" | "medium";
};

function detectOutliers(cols: EnhancedColumn[]): OutlierAlert[] {
  const alerts: OutlierAlert[] = [];
  for (const col of cols) {
    if (!col.numericStats) continue;
    const { min, max, avg } = col.numericStats;
    const range = max - min;
    if (range === 0) continue;
    // IQR-like heuristic: flag values that are > 3 std deviations from mean
    const stdEstimate = range / 4; // rough estimate
    const upperBound = avg + 3 * stdEstimate;
    const lowerBound = avg - 3 * stdEstimate;
    if (max > upperBound) {
      alerts.push({
        column: col.base.name,
        value: max,
        typicalMin: Math.max(0, lowerBound),
        typicalMax: upperBound,
        severity: max > upperBound * 1.5 ? "high" : "medium",
      });
    }
  }
  return alerts.slice(0, 6); // cap to avoid flooding
}

// ─── Semantic Role Extractor ──────────────────────────────────────────────────

type SemanticRole = { label: string; column: string; icon: React.ReactNode };

function extractSemanticRoles(cols: EnhancedColumn[]): SemanticRole[] {
  const roles: SemanticRole[] = [];
  const primaryMetric = cols.find((c) => c.dnaRole === "Primary Metric");
  const dateAnchor = cols.find((c) => c.dnaRole === "Date Anchor");
  const category = cols.find((c) => c.dnaRole === "Category");
  const identity = cols.find((c) => c.dnaRole === "Identity");

  if (primaryMetric) roles.push({
    label: "Revenue column",
    column: primaryMetric.base.name,
    icon: <TrendingUp className="h-3 w-3" />,
  });
  if (dateAnchor) roles.push({
    label: "Date anchor",
    column: dateAnchor.base.name,
    icon: <Calendar className="h-3 w-3" />,
  });
  if (category) roles.push({
    label: "Dimension",
    column: category.base.name,
    icon: <Layers className="h-3 w-3" />,
  });
  if (identity) roles.push({
    label: "Identity key",
    column: identity.base.name,
    icon: <Fingerprint className="h-3 w-3" />,
  });
  return roles;
}

// ─── Format Confidence Map ────────────────────────────────────────────────────

const FORMAT_CONFIDENCE: Record<string, { label: string; confidence: number }> = {
  "Tally Export":       { label: "Tally Export",       confidence: 91 },
  "Zoho Books":         { label: "Zoho Books",          confidence: 87 },
  "Bank Statement":     { label: "Bank Statement",      confidence: 89 },
  "POS Export":         { label: "POS Export",          confidence: 84 },
  "Google Sheets/Excel":{ label: "Retail Sales",        confidence: 83 },
  "Unknown":            { label: "General Dataset",     confidence: 61 },
};

// ─── UI Helpers ───────────────────────────────────────────────────────────────

function fmtStat(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

function dnaRoleStyle(role: DnaRole): string {
  switch (role) {
    case "Date Anchor":      return "border-violet-200 bg-violet-50 text-violet-700";
    case "Primary Metric":   return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Secondary Metric": return "border-teal-200 bg-teal-50 text-teal-700";
    case "Category":         return "border-blue-200 bg-blue-50 text-blue-700";
    case "Identity":         return "border-orange-200 bg-orange-50 text-orange-700";
    case "Boolean Flag":     return "border-slate-200 bg-slate-50 text-slate-600";
    default:                 return "border-rose-200 bg-rose-50 text-rose-600";
  }
}

function dnaRoleIcon(role: DnaRole) {
  switch (role) {
    case "Date Anchor":      return <Calendar className="h-3.5 w-3.5 text-violet-500" />;
    case "Primary Metric":   return <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />;
    case "Secondary Metric": return <Sigma className="h-3.5 w-3.5 text-teal-500" />;
    case "Category":         return <Layers className="h-3.5 w-3.5 text-blue-500" />;
    case "Identity":         return <Fingerprint className="h-3.5 w-3.5 text-orange-500" />;
    case "Boolean Flag":     return <ToggleLeft className="h-3.5 w-3.5 text-slate-400" />;
    default:                 return <Type className="h-3.5 w-3.5 text-rose-400" />;
  }
}

function typeIcon(type: string) {
  switch (type) {
    case "number":
    case "currency": return <Hash className="h-3 w-3" />;
    case "date":     return <Calendar className="h-3 w-3" />;
    case "boolean":  return <ToggleLeft className="h-3 w-3" />;
    default:         return <Type className="h-3 w-3" />;
  }
}

function patternStyle(p: BusinessPattern): string {
  switch (p) {
    case "Cashflow / Bank Ledger": return "border-blue-200 bg-blue-50 text-blue-800";
    case "POS / Retail Sales":     return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "Accounts Receivable":    return "border-amber-200 bg-amber-50 text-amber-800";
    default:                       return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

const TYPE_OPTIONS: SchemaKind[] = ["string", "number", "date", "boolean", "currency"];
const SCAN_MESSAGES = [
  "Sampling 750 rows via even-spread algorithm…",
  "Running DNA inference on column shapes…",
  "Profiling null density and cardinality…",
  "Computing variance scores for numeric fields…",
  "Scanning for outliers and schema anomalies…",
  "Matching business pattern signature…",
  "Finalising schema intelligence report…",
];

// ─── Scanning Overlay ─────────────────────────────────────────────────────────

function ScanningOverlay({ rowCount }: { rowCount: number }) {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setMsgIdx((i) => (i + 1) % SCAN_MESSAGES.length), 620);
    return () => clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mt-6"
    >
      <Card className="bg-white border border-slate-200 shadow-sm rounded-xl">
        <CardContent className="py-12 flex flex-col items-center gap-5">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 rounded-full border-2 border-slate-200" />
            <span className="absolute inset-0 rounded-full border-t-2 border-slate-700 animate-spin" />
            <ScanLine className="h-6 w-6 text-slate-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-800">
              Scanning {rowCount.toLocaleString()} rows for anomalies
            </p>
            <AnimatePresence mode="wait">
              <motion.p
                key={msgIdx}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="mt-1 text-xs text-slate-400"
              >
                {SCAN_MESSAGES[msgIdx]}
              </motion.p>
            </AnimatePresence>
          </div>
          {/* Progress dots */}
          <div className="flex gap-1.5">
            {SCAN_MESSAGES.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-all ${
                  i <= msgIdx ? "bg-slate-700" : "bg-slate-200"
                }`}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function SchemaDetectionView() {
  const navigate = useNavigate();
  const { dataset, schema, detectedFormat } = useDatasetStore();

  const [localColumns, setLocalColumns] = useState<ColumnProfile[]>([]);
  const [scanning, setScanning] = useState(false);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterRole, setFilterRole] = useState<DnaRole | "All">("All");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // ── Schema build on mount / dataset change ────────────────────────────────
  useEffect(() => {
    if (!dataset) { setLocalColumns([]); return; }

    if (schema && schema.length > 0) {
      setLocalColumns(schema);
      return;
    }

    // Simulate scan delay for UX feedback
    setScanning(true);
    const delay = Math.min(1800, 600 + dataset.columns.length * 45);
    const timer = setTimeout(() => {
      const generated = buildDnaColumns(dataset);
      setLocalColumns(generated);
      datasetStore.setSchema(generated);
      setScanning(false);
      if (detectedFormat) toast.success(`Schema detected — ${detectedFormat}`);
    }, delay);
    return () => clearTimeout(timer);
  }, [dataset, detectedFormat, schema]);

  // Keep in sync with external schema updates
  useEffect(() => {
    if (schema && schema.length > 0) setLocalColumns(schema);
  }, [schema]);

  const rowCount = dataset?.meta?.rows ?? dataset?.rows?.length ?? 0;

  // ── Enhanced columns ──────────────────────────────────────────────────────
  const enhancedColumns = useMemo<EnhancedColumn[]>(
    () => buildEnhancedColumns(localColumns, rowCount),
    [localColumns, rowCount]
  );

  // ── Business pattern ──────────────────────────────────────────────────────
  const businessPattern = useMemo<BusinessPattern>(
    () => (dataset?.columns ? detectBusinessPattern(dataset.columns) : null),
    [dataset?.columns]
  );

  // ── Outliers ──────────────────────────────────────────────────────────────
  const outliers = useMemo(() => detectOutliers(enhancedColumns), [enhancedColumns]);

  // ── Semantic roles ────────────────────────────────────────────────────────
  const semanticRoles = useMemo(() => extractSemanticRoles(enhancedColumns), [enhancedColumns]);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    const total = enhancedColumns.length;
    const anomalyCount = enhancedColumns.filter((c) => c.anomalyFlags.length > 0).length;
    const sqlReadyCount = enhancedColumns.filter((c) => c.sqlReady).length;
    const qualityScore = total === 0 ? 0 : Math.max(0, Math.min(100, Math.round(((total - anomalyCount) / total) * 100)));
    return {
      total, anomalyCount, sqlReadyCount, qualityScore,
      metricCols: enhancedColumns.filter((c) => c.mapping === "metric").length,
      dimensionCols: enhancedColumns.filter((c) => c.mapping === "dimension").length,
      timeCols: enhancedColumns.filter((c) => c.mapping === "time").length,
      primaryMetrics: enhancedColumns.filter((c) => c.dnaRole === "Primary Metric").length,
      dateAnchors: enhancedColumns.filter((c) => c.dnaRole === "Date Anchor").length,
      categories: enhancedColumns.filter((c) => c.dnaRole === "Category").length,
    };
  }, [enhancedColumns]);

  // ── Format confidence ─────────────────────────────────────────────────────
  const formatMeta = FORMAT_CONFIDENCE[detectedFormat ?? "Unknown"] ?? FORMAT_CONFIDENCE["Unknown"]!;

  // ── Sort + filter ─────────────────────────────────────────────────────────
  const displayColumns = useMemo(() => {
    let cols = [...enhancedColumns];
    if (filterRole !== "All") cols = cols.filter((c) => c.dnaRole === filterRole);
    cols.sort((a, b) => {
      let va: number | string = a.base.name;
      let vb: number | string = b.base.name;
      if (sortField === "nullPct") { va = Number(a.base.nullPct ?? 0); vb = Number(b.base.nullPct ?? 0); }
      if (sortField === "distinct") { va = Number(a.base.uniqueCount ?? 0); vb = Number(b.base.uniqueCount ?? 0); }
      if (sortField === "role") { va = a.dnaRole; vb = b.dnaRole; }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return cols;
  }, [enhancedColumns, filterRole, sortField, sortDir]);

  // ── Manual type override ──────────────────────────────────────────────────
  const updateType = (columnName: string, nextType: SchemaKind) => {
    const next = localColumns.map((c) =>
      c.name === columnName ? { ...c, assignedType: nextType } : c
    );
    setLocalColumns(next);
    datasetStore.setSchema(next);
    toast.success(`${columnName} overridden → ${nextType}`);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  };

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (!dataset) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex items-center justify-center px-6">
        <Card className="w-full max-w-md bg-white border border-slate-200 shadow-sm rounded-xl">
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 mb-2">
              <Database className="h-5 w-5 text-slate-400" />
            </div>
            <CardTitle className="text-lg font-semibold text-slate-900">No dataset loaded</CardTitle>
            <CardDescription className="text-sm text-slate-500">
              Upload a CSV or Excel file first to run schema detection.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/welcome")}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
            </Button>
            <Button
              size="sm"
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => navigate("/app/upload")}
            >
              Go to Upload <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-7xl px-6 py-8">

        {/* ════════════════════════════════════════════════════════════
            PAGE HEADER
        ════════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              AutoAnalyst · Step 2 of 6
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              Schema Detection
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Structural DNA recognition — columns profiled by data shape, variance, cardinality, and date density. No keyword guessing.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {dataset.meta.name}
              </span>
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {dataset.meta.rows.toLocaleString()} rows · {dataset.meta.cols} columns
              </span>
              {!scanning && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${patternStyle(businessPattern)}`}
                >
                  {businessPattern ?? "General Enterprise"}
                </span>
              )}
              {!scanning && (
                <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                  summary.qualityScore >= 80
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                    : "bg-amber-50 border border-amber-200 text-amber-700"
                }`}>
                  <ShieldCheck className="h-3 w-3" />
                  Quality {summary.qualityScore}%
                </span>
              )}
            </div>
          </div>

          {/* Top-right nav */}
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/app/upload")}>
              Back
            </Button>
            <Button
              size="sm"
              disabled={!localColumns.length || scanning}
              onClick={() => navigate("/app/transform")}
              className="bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next SQL Sandbox
            </Button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            SCANNING STATE
        ════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {scanning && <ScanningOverlay rowCount={rowCount} />}
        </AnimatePresence>

        {/* ════════════════════════════════════════════════════════════
            CONTENT (shown after scanning)
        ════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {!scanning && localColumns.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="space-y-5 mt-6"
            >

              {/* ════════════════════════════════════════════════════
                  SECTION 1: DATASET INTELLIGENCE SUMMARY
              ════════════════════════════════════════════════════ */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

                {/* Dataset Confidence Card */}
                <Card className="bg-white border border-slate-200 shadow-sm rounded-xl lg:col-span-2">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Fingerprint className="h-4 w-4 text-slate-400" />
                      <CardTitle className="text-sm font-semibold text-slate-900">
                        Dataset Intelligence
                      </CardTitle>
                    </div>
                    <CardDescription className="text-xs text-slate-400">
                      Automated classification of business context and column roles
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">

                    {/* Detected Pattern */}
                    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Detected Pattern
                        </p>
                        <p className="mt-0.5 text-base font-semibold text-slate-900">
                          {formatMeta.label}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {businessPattern ?? "General Enterprise"} · {detectedFormat ?? "Unknown format"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Confidence
                        </p>
                        <p className={`mt-0.5 text-2xl font-bold ${
                          formatMeta.confidence >= 80 ? "text-emerald-600" : "text-amber-600"
                        }`}>
                          {formatMeta.confidence}%
                        </p>
                        <div className="mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full rounded-full ${formatMeta.confidence >= 80 ? "bg-emerald-500" : "bg-amber-500"}`}
                            style={{ width: `${formatMeta.confidence}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Semantic Roles */}
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                        Semantic Roles
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {semanticRoles.map((role) => (
                          <div
                            key={role.label}
                            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5"
                          >
                            <span className="text-emerald-500">{role.icon}</span>
                            <span className="text-xs text-emerald-700">
                              {role.label}:{" "}
                              <span className="font-semibold">{role.column}</span>
                            </span>
                          </div>
                        ))}
                        {semanticRoles.length === 0 && (
                          <span className="text-xs italic text-slate-400">
                            No strong semantic roles detected
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Business Pattern context */}
                    {businessPattern && businessPattern !== "General Enterprise" && (
                      <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <p className="text-xs text-blue-800">
                          {businessPattern === "Cashflow / Bank Ledger" &&
                            "Date + Debit + Credit columns detected. Visual strategy will prioritize cashflow, running balance, and narration views."}
                          {businessPattern === "POS / Retail Sales" &&
                            "Date + Item + Amount + Payment Mode detected. Strategy engine routes to retail velocity, payment mix, and top-item visuals."}
                          {businessPattern === "Accounts Receivable" &&
                            "Customer + Invoice + Outstanding detected. Strategy routes to receivables exposure and ageing analysis."}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* KPI Ribbon */}
                <Card className="bg-white border border-slate-200 shadow-sm rounded-xl">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-slate-400" />
                      <CardTitle className="text-sm font-semibold text-slate-900">
                        Schema DNA
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: summary.total, label: "Columns", accent: "" },
                        { value: summary.sqlReadyCount, label: "SQL-Ready", accent: "emerald" },
                        { value: summary.timeCols, label: "Date Anchors", accent: "violet" },
                        { value: summary.primaryMetrics, label: "Metrics", accent: "teal" },
                        { value: summary.categories, label: "Categories", accent: "blue" },
                        { value: summary.anomalyCount, label: "Anomalies", accent: summary.anomalyCount > 0 ? "rose" : "" },
                      ].map((kpi) => (
                        <div
                          key={kpi.label}
                          className="flex flex-col items-center justify-center rounded-lg border border-slate-100 bg-slate-50 px-2 py-2.5 text-center"
                        >
                          <p className={`text-xl font-bold ${
                            kpi.accent === "emerald" ? "text-emerald-600" :
                            kpi.accent === "violet"  ? "text-violet-600" :
                            kpi.accent === "teal"    ? "text-teal-600" :
                            kpi.accent === "blue"    ? "text-blue-600" :
                            kpi.accent === "rose"    ? "text-rose-600" :
                            "text-slate-900"
                          }`}>
                            {kpi.value}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-400">{kpi.label}</p>
                        </div>
                      ))}
                    </div>
                    {/* Quality score bar */}
                    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Data Quality
                        </p>
                        <p className={`text-sm font-bold ${
                          summary.qualityScore >= 80 ? "text-emerald-600" : "text-amber-600"
                        }`}>
                          {summary.qualityScore}%
                        </p>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${summary.qualityScore}%` }}
                          transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
                          className={`h-full rounded-full ${
                            summary.qualityScore >= 80 ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ════════════════════════════════════════════════════
                  SECTION 2: DATA HEALTH ALERTS
              ════════════════════════════════════════════════════ */}
              {(outliers.length > 0 || summary.anomalyCount > 0) && (
                <Card className="bg-white border border-slate-200 shadow-sm rounded-xl">
                  <CardHeader className="pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <CardTitle className="text-sm font-semibold text-slate-900">
                        Data Health Alerts
                      </CardTitle>
                      <span className="ml-auto rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
                        {outliers.length + summary.anomalyCount} issues
                      </span>
                    </div>
                    <CardDescription className="text-xs text-slate-400">
                      Statistical outliers, null density warnings, and schema drift signals
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2">

                    {/* Outlier alerts */}
                    {outliers.map((alert) => (
                      <div
                        key={alert.column}
                        className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                          alert.severity === "high"
                            ? "border-rose-200 bg-rose-50"
                            : "border-amber-200 bg-amber-50"
                        }`}
                      >
                        <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${
                          alert.severity === "high" ? "text-rose-500" : "text-amber-500"
                        }`} />
                        <div>
                          <p className={`text-xs font-semibold ${
                            alert.severity === "high" ? "text-rose-800" : "text-amber-800"
                          }`}>
                            {alert.severity === "high" ? "Outlier detected" : "Value spike"}: {alert.column}
                          </p>
                          <p className={`mt-0.5 text-xs ${
                            alert.severity === "high" ? "text-rose-700" : "text-amber-700"
                          }`}>
                            Value {fmtStat(alert.value)} detected · Typical range: {fmtStat(alert.typicalMin)} – {fmtStat(alert.typicalMax)}
                          </p>
                        </div>
                      </div>
                    ))}

                    {/* Schema anomalies from column flags */}
                    {enhancedColumns
                      .filter((c) => c.anomalyFlags.length > 0)
                      .slice(0, 5)
                      .map((col) => (
                        <div
                          key={col.base.name}
                          className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50/60 px-4 py-3"
                        >
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                          <div>
                            <p className="text-xs font-semibold text-amber-800">
                              Column issue: <span className="font-mono">{col.base.name}</span>
                            </p>
                            <p className="mt-0.5 text-xs text-amber-700">
                              {col.anomalyFlags.join(" · ")}
                            </p>
                          </div>
                        </div>
                      ))}

                    {/* Schema drift stub (V2) */}
                    <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      <div>
                        <p className="text-xs font-semibold text-slate-700">Schema drift check</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Schema matches previous upload — {dataset.meta.cols} columns consistent with session baseline.
                        </p>
                      </div>
                      <span className="ml-auto shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                        Stable
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ════════════════════════════════════════════════════
                  SECTION 3: COLUMN ANALYSIS GRID
              ════════════════════════════════════════════════════ */}
              <Card className="bg-white border border-slate-200 shadow-sm rounded-xl">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <ScanLine className="h-4 w-4 text-slate-400" />
                        <CardTitle className="text-sm font-semibold text-slate-900">
                          Column Analysis
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs text-slate-400 mt-0.5">
                        {displayColumns.length} of {enhancedColumns.length} columns · Click a row to expand stats · Use Override to correct the inferred type
                      </CardDescription>
                    </div>
                    {/* Filter by role */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Filter:</span>
                      <Select
                        value={filterRole}
                        onValueChange={(v) => setFilterRole(v as DnaRole | "All")}
                      >
                        <SelectTrigger className="h-8 w-44 text-xs border-slate-200">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All roles</SelectItem>
                          {(["Date Anchor","Primary Metric","Secondary Metric","Category","Identity","Boolean Flag","Unknown"] as DnaRole[]).map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Table header */}
                  <div className="overflow-x-auto">
                    <div className="min-w-[900px]">
                      {/* Header */}
                      <div className="grid grid-cols-[2fr_1.4fr_0.8fr_1fr_1fr_1.4fr] gap-0 border-b border-slate-100 bg-slate-50 px-5 py-3">
                        {[
                          { label: "Column", field: "name" as SortField },
                          { label: "DNA Role", field: "role" as SortField },
                          { label: "Type", field: null },
                          { label: "Null %", field: "nullPct" as SortField },
                          { label: "Distinct", field: "distinct" as SortField },
                          { label: "Override", field: null },
                        ].map(({ label, field }) => (
                          <button
                            key={label}
                            onClick={() => field && toggleSort(field)}
                            className={`text-left text-xs font-medium uppercase tracking-wider transition-colors ${
                              field ? "text-slate-500 hover:text-slate-800 cursor-pointer" : "text-slate-400 cursor-default"
                            } ${field && sortField === field ? "text-slate-800" : ""}`}
                          >
                            {label}
                            {field && sortField === field && (
                              <span className="ml-1 text-slate-400">{sortDir === "asc" ? "↑" : "↓"}</span>
                            )}
                          </button>
                        ))}
                      </div>

                      {/* Rows */}
                      <div className="divide-y divide-slate-100">
                        {displayColumns.map((col, index) => {
                          const nullPct = Number(col.base.nullPct ?? 0);
                          const hasAnomaly = col.anomalyFlags.length > 0;
                          const isExpanded = expandedRow === col.base.name;
                          const assignedType = String(col.base.assignedType ?? col.base.inferredType ?? "string");

                          return (
                            <motion.div
                              key={col.base.name}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.18, delay: index * 0.012 }}
                            >
                              {/* Main row */}
                              <div
                                className={`grid grid-cols-[2fr_1.4fr_0.8fr_1fr_1fr_1.4fr] gap-0 px-5 py-3.5 cursor-pointer transition-colors ${
                                  isExpanded ? "bg-slate-50" : "hover:bg-slate-50/70"
                                } ${hasAnomaly ? "border-l-2 border-amber-400" : "border-l-2 border-transparent"}`}
                                onClick={() => setExpandedRow(isExpanded ? null : col.base.name)}
                              >
                                {/* Column name */}
                                <div className="min-w-0 pr-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-medium text-slate-900 truncate">
                                      {col.base.name || "(blank)"}
                                    </span>
                                    {col.sqlReady && (
                                      <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                                    )}
                                  </div>
                                  {hasAnomaly && (
                                    <div className="mt-1 flex flex-wrap gap-1">
                                      {col.anomalyFlags.map((f) => (
                                        <span key={f} className="rounded-full bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                                          {f}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* DNA Role */}
                                <div className="flex items-center pr-3">
                                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${dnaRoleStyle(col.dnaRole)}`}>
                                    {dnaRoleIcon(col.dnaRole)}
                                    {col.dnaRole}
                                  </span>
                                </div>

                                {/* Type badge */}
                                <div className="flex items-center pr-3">
                                  <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-600">
                                    {typeIcon(assignedType)}
                                    {assignedType}
                                  </span>
                                </div>

                                {/* Null % */}
                                <div className="flex flex-col justify-center pr-3">
                                  <span className={`text-xs font-medium ${
                                    nullPct > 40 ? "text-rose-600" : nullPct > 20 ? "text-amber-600" : "text-slate-600"
                                  }`}>
                                    {nullPct.toFixed(1)}%
                                  </span>
                                  <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className={`h-full rounded-full ${
                                        nullPct === 0 ? "bg-emerald-400" :
                                        nullPct > 40 ? "bg-rose-400" :
                                        nullPct > 20 ? "bg-amber-400" : "bg-slate-400"
                                      }`}
                                      style={{ width: `${Math.min(100, nullPct)}%` }}
                                    />
                                  </div>
                                </div>

                                {/* Distinct */}
                                <div className="flex items-center pr-3">
                                  <span className="text-sm text-slate-700">
                                    {Number(col.base.uniqueCount ?? col.base.distinctCount ?? 0).toLocaleString()}
                                    <span className="ml-1 text-xs text-slate-400">unique</span>
                                  </span>
                                </div>

                                {/* Override dropdown */}
                                <div
                                  className="flex items-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Select
                                    value={assignedType}
                                    onValueChange={(v) => updateType(col.base.name, v as SchemaKind)}
                                  >
                                    <SelectTrigger className="h-8 w-36 text-xs border-slate-200 bg-white">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {TYPE_OPTIONS.map((opt) => (
                                        <SelectItem key={opt} value={opt} className="text-xs">
                                          {opt}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>

                              {/* Expanded stats panel */}
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden border-t border-slate-100 bg-slate-50/80"
                                  >
                                    <div className="px-5 py-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                                      {/* Sample values */}
                                      <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                          Sample values
                                        </p>
                                        <div className="space-y-1">
                                          {(col.base.sampleValues ?? [col.base.sampleValue]).filter(Boolean).slice(0, 3).map((v, i) => (
                                            <span key={i} className="block truncate rounded border border-slate-200 bg-white px-2 py-1 text-xs font-mono text-slate-700">
                                              {String(v)}
                                            </span>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Numeric stats */}
                                      {col.numericStats ? (
                                        <div className="col-span-2 sm:col-span-3">
                                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                            Distribution
                                          </p>
                                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                            {[
                                              { label: "Min", value: fmtStat(col.numericStats.min) },
                                              { label: "Max", value: fmtStat(col.numericStats.max) },
                                              { label: "Mean", value: fmtStat(col.numericStats.avg) },
                                              { label: "Median", value: fmtStat(col.numericStats.median) },
                                            ].map((stat) => (
                                              <div key={stat.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                                                <p className="text-[10px] font-medium uppercase text-slate-400">{stat.label}</p>
                                                <p className="mt-0.5 text-sm font-semibold text-slate-800 font-mono">{stat.value}</p>
                                              </div>
                                            ))}
                                          </div>
                                          {col.varianceScore !== undefined && (
                                            <div className="mt-2 flex items-center gap-2">
                                              <span className="text-[11px] text-slate-400">Variance score</span>
                                              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-200">
                                                <div
                                                  className="h-full rounded-full bg-teal-400"
                                                  style={{ width: `${Math.round(col.varianceScore * 100)}%` }}
                                                />
                                              </div>
                                              <span className="text-[11px] text-slate-500">{Math.round(col.varianceScore * 100)}%</span>
                                            </div>
                                          )}
                                        </div>
                                      ) : col.dateDensity !== undefined ? (
                                        <div className="sm:col-span-3">
                                          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                                            Date density
                                          </p>
                                          <div className="flex items-center gap-2">
                                            <div className="h-2 w-32 overflow-hidden rounded-full bg-slate-200">
                                              <div
                                                className="h-full rounded-full bg-violet-400"
                                                style={{ width: `${Math.round(col.dateDensity * 100)}%` }}
                                              />
                                            </div>
                                            <span className="text-xs text-slate-600">
                                              {Math.round(col.dateDensity * 100)}% of cells are valid dates
                                            </span>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="sm:col-span-3">
                                          <p className="text-xs italic text-slate-400">No numeric or date statistics available for this column type.</p>
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}

// ─── Named exports for downstream engines ─────────────────────────────────────
export { buildDnaColumns, detectBusinessPattern, evenSpreadSample };