// ─────────────────────────────────────────────────────────────────────────────
// visualstrategies.ts — DNA Insight Engine v4.0 (Hybrid Intelligence)
// Model-agnostic visual routing. 100% offline heuristics as deterministic base.
// v4.0 changes vs v3.1:
//   1. getTemplateStrategy() accepts CombinedAudit (from useDualAudit) directly
//      — AI recommendedCharts list re-orders and prioritises strategic views
//   2. Hybrid Decision Engine: AI pattern → forced chart injection
//      (Complex Cashflow → liquidity-flow + net-flow always included)
//   3. AI narrative reasoning mapped to each chart.reasoning field
//      so VisualDesign AIInsightBadge shows it in the card footer
//   4. All interpretive logic bounded to 800-row smart sample (enforced)
//   5. buildBaseModelSignals() and computeDateDensity() remain named exports
// ─────────────────────────────────────────────────────────────────────────────


import { AuditSource } from "../lib_old/DatasetStore";
import type { ColumnProfile } from "../lib_old/DatasetTypes";
export type CombinedAuditInput = {
  detectedPattern?: string;
  recommendedCharts?: string[];
  reasoning?: string;         // board-level narrative from DeepSeek/Gemini
  executiveSummary?: string;  // used for per-chart reasoning injection
  primarySignals?: string[];  // injected into chart reasoning text
  patternConfidence?: number;
  source?: import("../lib_old/DatasetStore").AuditSource;
};


// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateId =
  | "auto"
  | "tally-sales"
  | "tally-ledger"
  | "bank"
  | "zoho"
  | "pos"
  | "excel"
  | "generic";

export type ChartType =
  | "area"
  | "bar"
  | "line"
  | "pie"
  | "composed"
  | "histogram"
  | "stackedBar";

export type ChartPoint = {
  label: string;
  value: number;
  secondaryValue?: number;
  tertiaryValue?: number;
};

export type DashboardChart = {
  id: string;
  type: ChartType;
  title: string;
  description: string;
  reasoning?: string;
  hasAnomaly?: boolean;
  anomalyPeak?: number;
};

export type DashboardKpi = {
  id: string;
  label: string;
  value: string;
};

export type DataAudit = {
  detectedPattern?: string;
  recommendedCharts?: string[];
  reasoning?: string;
  /**
   * heuristic       — 100% offline CV / cardinality scoring
   * llm-bridge      — single provider via VITE_LLM_AUDIT_METADATA env var
   * merged          — Gemini (structured) + OpenRouter DeepSeek R1 (narrative)
   * gemini-only     — Gemini responded, OpenRouter did not
   * openrouter-only — OpenRouter responded, Gemini did not
   */
  source?: AuditSource;
};

export type BaseModelSignals = {
  rowCount: number;
  columnCount: number;
  numericCount: number;
  textCount: number;
  dateCount: number;
  highCardinalityTextCount: number;
  dateDensity: number;
  /** Coefficient of Variation for primary numeric column (0–2) */
  numericVarianceScore: number;
  /** CV of secondary numeric column */
  secondaryVarianceScore: number;
  patternConfidence: number;
  inferredPattern: string;
  lowCardTextCols: string[];
  midCardTextCols: string[];
  highCardTextCols: string[];
  dateCols: string[];
  numericCols: string[];
};

function fromCombinedAudit(ai: CombinedAuditInput): DataAudit {
  return {
    detectedPattern:   ai.detectedPattern,
    recommendedCharts: ai.recommendedCharts,
    // Prefer executiveSummary for per-chart context; fall back to reasoning
    reasoning: ai.executiveSummary ?? ai.reasoning,
    source:    ai.source,
  };
}

export type VisualStrategy = {
  resolvedTemplate: TemplateId;
  charts: DashboardChart[];
  kpis: DashboardKpi[];
  transformedData: Record<string, ChartPoint[]>;
  pinnedChartIds: string[];
  audit: DataAudit;
  signals: BaseModelSignals;
};

type RowRecord = Record<string, unknown>;
type StrategyBase = Omit<VisualStrategy, "pinnedChartIds" | "audit" | "signals">;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Core Utilities
// ─────────────────────────────────────────────────────────────────────────────

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value ?? "")
    .replace(/,/g, "")
    .replace(/[₹$€£¥]/g, "")
    .replace(/[^\d.-]/g, "")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Smart Even-Spread Sampler
// ─────────────────────────────────────────────────────────────────────────────

function smartSample(rows: RowRecord[], targetCount = 800): RowRecord[] {
  if (rows.length <= targetCount) return rows;
  const step = rows.length / targetCount;
  const out: RowRecord[] = [];
  for (let i = 0; i < targetCount; i++) {
    out.push(rows[Math.min(Math.round(i * step), rows.length - 1)]);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Anomaly Detection
// ─────────────────────────────────────────────────────────────────────────────

function detectSeriesAnomaly(points: ChartPoint[]): {
  hasAnomaly: boolean;
  anomalyPeak?: number;
} {
  if (points.length < 4) return { hasAnomaly: false };
  const vals = points.map((p) => p.value);
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return { hasAnomaly: false };
  const threshold = mean + 2 * stdDev;
  const peak = Math.max(...vals);
  return peak > threshold
    ? { hasAnomaly: true, anomalyPeak: peak }
    : { hasAnomaly: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Column Detection & Scoring
// ─────────────────────────────────────────────────────────────────────────────

function scoreColumn(column: string, keywords: string[]): number {
  const c = norm(column);
  let score = 0;
  for (const kw of keywords) {
    if (c === kw) score += 10;
    else if (c.includes(kw)) score += 6;
    else score += kw.split(" ").filter((p) => c.includes(p)).length * 2;
  }
  return score;
}

function findColumn(columns: string[], keywords: string[]): string | null {
  return (
    columns
      .map((col) => ({ col, score: scoreColumn(col, keywords) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.col ?? null
  );
}

function detectDateColumns(columns: string[], rows: RowRecord[]): string[] {
  return columns.filter((col) => {
    const sample = rows.slice(0, 120).map((r) => parseDate(r[col])).filter(Boolean);
    return sample.length >= Math.max(4, Math.floor(Math.min(120, rows.length) * 0.35));
  });
}

function findNumericColumns(columns: string[], rows: RowRecord[]): string[] {
  return columns.filter((col) => {
    const sample = rows.slice(0, 120).map((r) => parseNumber(r[col])).filter((v) => v !== null);
    return sample.length >= Math.max(4, Math.floor(Math.min(120, rows.length) * 0.35));
  });
}

function classifyTextColumns(
  columns: string[],
  rows: RowRecord[]
): { all: string[]; low: string[]; mid: string[]; high: string[] } {
  const N = Math.min(200, rows.length);
  const profiles = columns
    .map((col) => {
      const vals = rows.slice(0, N).map((r) => String(r[col] ?? "").trim()).filter(Boolean);
      const unique = new Set(vals).size;
      const numLike = vals.filter((v) => parseNumber(v) !== null).length;
      return { col, unique, textLike: numLike < Math.max(1, vals.length * 0.5) };
    })
    .filter((p) => p.textLike)
    .sort((a, b) => b.unique - a.unique);
  return {
    all: profiles.map((p) => p.col),
    low: profiles.filter((p) => p.unique < 12).map((p) => p.col),
    mid: profiles.filter((p) => p.unique >= 12 && p.unique <= 50).map((p) => p.col),
    high: profiles.filter((p) => p.unique > 50).map((p) => p.col),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: CV Scoring & Date Density
// ─────────────────────────────────────────────────────────────────────────────

function computeCV(rows: RowRecord[], col: string | null): number {
  if (!col) return 0;
  const vals = rows
    .slice(0, 400)
    .map((r) => parseNumber(r[col]))
    .filter((v): v is number => v !== null && v >= 0);
  if (vals.length < 4) return 0;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  if (mean === 0) return 0;
  const stdDev = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  return Number(Math.min(2, stdDev / mean).toFixed(3));
}

// ── EXPORT: SchemaDetectionView uses this in the expanded column detail panel ─
export function computeDateDensity(col: string, rows: RowRecord[]): number {
  const N = Math.min(150, rows.length);
  if (N === 0) return 0;
  const valid = rows.slice(0, N).filter((r) => parseDate(r[col]) !== null).length;
  return Number((valid / N).toFixed(3));
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: Base Model Signals
// ── EXPORT: Called once by UploadPageView at ingest time.
//    Result stored in datasetStore.signals so SchemaDetectionView never
//    has to recompute it — single source of truth for inferredPattern.
// ─────────────────────────────────────────────────────────────────────────────

export function buildBaseModelSignals(columns: string[], rows: RowRecord[]): BaseModelSignals {
  const numericCols = findNumericColumns(columns, rows);
  const textBuckets = classifyTextColumns(columns, rows);
  const dateCols = detectDateColumns(columns, rows);

  const dateDensity = columns.length
    ? Number((dateCols.length / columns.length).toFixed(3))
    : 0;

  const cvPrimary = computeCV(rows, numericCols[0] ?? null);
  const cvSecondary = computeCV(rows, numericCols[1] ?? null);

  const hasDebit = !!findColumn(columns, ["debit", "withdrawal", "dr", "outflow"]);
  const hasCredit = !!findColumn(columns, ["credit", "deposit", "cr", "inflow"]);
  const hasNarration = !!findColumn(columns, ["narration", "remarks", "description", "particular"]);
  const hasInvoice = !!findColumn(columns, ["invoice", "invoice number", "bill no", "voucher no"]);
  const hasCustomer = !!findColumn(columns, ["customer", "client", "party", "contact"]);
  const hasItem = !!findColumn(columns, ["item", "product", "stock item", "sku"]);
  const hasPayment = !!findColumn(columns, ["payment mode", "payment", "mode", "tender"]);
  const hasMRR = !!findColumn(columns, ["mrr", "arr", "subscription", "plan", "renewal", "churn"]);
  const hasBalance = !!findColumn(columns, ["balance", "outstanding", "receivable", "amount due"]);

  let inferredPattern = "General Enterprise";
  let patternConfidence = 0.55;

  if (hasMRR && dateCols.length && numericCols.length) {
    inferredPattern = "Subscription Burn"; patternConfidence = 0.88;
  } else if (hasDebit && hasCredit && hasNarration) {
    inferredPattern = "Complex Cashflow"; patternConfidence = 0.9;
  } else if (hasItem && hasPayment && hasInvoice) {
    inferredPattern = "High-Velocity Retail"; patternConfidence = 0.92;
  } else if (hasInvoice && hasCustomer && hasBalance) {
    inferredPattern = "Receivables Exposure"; patternConfidence = 0.84;
  } else if (hasInvoice && hasCustomer) {
    inferredPattern = "Revenue Operations"; patternConfidence = 0.8;
  } else if (dateCols.length && numericCols.length && textBuckets.high.length > 0 && cvPrimary > 0.35) {
    inferredPattern = "Operational Trend Mix"; patternConfidence = 0.76;
  } else if (textBuckets.low.length >= 2 && numericCols.length) {
    inferredPattern = "Category-Heavy Analysis"; patternConfidence = 0.7;
  }

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    numericCount: numericCols.length,
    textCount: textBuckets.all.length,
    dateCount: dateCols.length,
    highCardinalityTextCount: textBuckets.high.length,
    dateDensity,
    numericVarianceScore: cvPrimary,
    secondaryVarianceScore: cvSecondary,
    patternConfidence,
    inferredPattern,
    lowCardTextCols: textBuckets.low,
    midCardTextCols: textBuckets.mid,
    highCardTextCols: textBuckets.high,
    dateCols,
    numericCols,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Shape Audit
// ─────────────────────────────────────────────────────────────────────────────

type ShapeAuditResult = {
  hasTrend: boolean;
  hasConcentration: boolean;
  hasLiquidity: boolean;
  hasVolumeDist: boolean;
  hasMultiMetric: boolean;
  cvScore: number;
  avgDateDensity: number;
  lowCardinalityTextCols: string[];
  midCardinalityTextCols: string[];
  dateCol: string | null;
  secondDateCol: string | null;
  primaryNumeric: string | null;
  secondaryNumeric: string | null;
  debitCol: string | null;
  creditCol: string | null;
};

function runDataShapeAudit(columns: string[], rows: RowRecord[]): ShapeAuditResult {
  const dateCols = detectDateColumns(columns, rows);
  const numericCols = findNumericColumns(columns, rows);
  const textBuckets = classifyTextColumns(columns, rows);

  const primaryNumeric = numericCols[0] ?? null;
  const secondaryNumeric = numericCols[1] ?? null;
  const cvScore = computeCV(rows, primaryNumeric);

  const avgDateDensity =
    dateCols.length === 0
      ? 0
      : dateCols.reduce((s, c) => s + computeDateDensity(c, rows), 0) / dateCols.length;

  const debitCol = findColumn(columns, ["debit", "withdrawal", "outflow", "dr"]);
  const creditCol = findColumn(columns, ["credit", "deposit", "inflow", "cr"]);

  const hasTrend = dateCols.length > 0 && cvScore > 0.25;
  const hasConcentration = textBuckets.low.length > 0;
  const hasLiquidity = !!(debitCol && creditCol);
  const transactionCol = primaryNumeric ?? findColumn(columns, ["bill amount", "amount", "total"]);
  const hasVolumeDist = !!transactionCol && rows.length > 20;
  const hasMultiMetric = numericCols.length >= 3;

  return {
    hasTrend, hasConcentration, hasLiquidity, hasVolumeDist, hasMultiMetric,
    cvScore, avgDateDensity,
    lowCardinalityTextCols: textBuckets.low,
    midCardinalityTextCols: textBuckets.mid,
    dateCol: dateCols[0] ?? null,
    secondDateCol: dateCols[1] ?? null,
    primaryNumeric, secondaryNumeric, debitCol, creditCol,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8: Series Builders
// ─────────────────────────────────────────────────────────────────────────────

function buildDateSeries(rows: RowRecord[], dateCol: string | null, valueCol: string | null, limit = 30): ChartPoint[] {
  if (!dateCol || !valueCol) return [];
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const d = parseDate(row[dateCol]); if (!d) continue;
    const k = d.toISOString().slice(0, 10);
    buckets.set(k, (buckets.get(k) ?? 0) + (parseNumber(row[valueCol]) ?? 0));
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-limit).map(([label, value]) => ({ label, value }));
}

function buildMonthSeries(rows: RowRecord[], dateCol: string | null, valueCol: string | null, limit = 12): ChartPoint[] {
  if (!dateCol || !valueCol) return [];
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const d = parseDate(row[dateCol]); if (!d) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.set(k, (buckets.get(k) ?? 0) + (parseNumber(row[valueCol]) ?? 0));
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-limit).map(([label, value]) => ({ label, value }));
}

function buildCategorySeries(rows: RowRecord[], catCol: string | null, valCol: string | null, limit = 8): ChartPoint[] {
  if (!catCol || !valCol) return [];
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[catCol] ?? "").trim() || "Unknown";
    buckets.set(label, (buckets.get(label) ?? 0) + (parseNumber(row[valCol]) ?? 0));
  }
  return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, value]) => ({ label, value }));
}

function buildCountSeries(rows: RowRecord[], catCol: string | null, limit = 8): ChartPoint[] {
  if (!catCol) return [];
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[catCol] ?? "").trim() || "Unknown";
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, value]) => ({ label, value }));
}

function buildHistogram(rows: RowRecord[], numCol: string | null): ChartPoint[] {
  if (!numCol) return [];
  const vals = rows.map((r) => parseNumber(r[numCol])).filter((v): v is number => v !== null);
  if (!vals.length) return [];
  const min = Math.min(...vals); const max = Math.max(...vals);
  const bins = 8; const span = Math.max(1, max - min); const size = span / bins;
  const counts = Array.from({ length: bins }, () => 0);
  for (const v of vals) { const idx = Math.min(bins - 1, Math.floor((v - min) / size)); counts[idx]++; }
  return counts.map((count, i) => ({ label: `${Math.round(min + i * size)}–${Math.round(min + (i + 1) * size)}`, value: count }));
}

function buildRunningBalance(rows: RowRecord[], dateCol: string | null, inflowCol: string | null, outflowCol: string | null): ChartPoint[] {
  if (!dateCol || !inflowCol || !outflowCol) return [];
  const ordered = rows
    .map((r) => ({ date: parseDate(r[dateCol]), inflow: parseNumber(r[inflowCol]) ?? 0, outflow: parseNumber(r[outflowCol]) ?? 0 }))
    .filter((r) => r.date !== null)
    .sort((a, b) => a.date!.getTime() - b.date!.getTime());
  let bal = 0;
  return ordered.slice(-60).map((r) => { bal += r.inflow - r.outflow; return { label: r.date!.toISOString().slice(5, 10), value: bal }; });
}

function buildComposedFlow(rows: RowRecord[], dateCol: string | null, debitCol: string | null, creditCol: string | null): ChartPoint[] {
  if (!dateCol || !debitCol || !creditCol) return [];
  const buckets = new Map<string, { debit: number; credit: number }>();
  for (const row of rows) {
    const d = parseDate(row[dateCol]); if (!d) continue;
    const k = d.toISOString().slice(0, 10);
    const cur = buckets.get(k) ?? { debit: 0, credit: 0 };
    cur.debit += parseNumber(row[debitCol]) ?? 0;
    cur.credit += parseNumber(row[creditCol]) ?? 0;
    buckets.set(k, cur);
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-24).map(([label, v]) => ({ label, value: v.debit, secondaryValue: v.credit }));
}

function buildHourlySeries(rows: RowRecord[], dateCol: string | null, valueCol: string | null): ChartPoint[] {
  if (!dateCol || !valueCol) return [];
  const buckets = new Map<number, number>();
  for (const row of rows) {
    const d = parseDate(row[dateCol]); if (!d) continue;
    const h = d.getHours();
    buckets.set(h, (buckets.get(h) ?? 0) + (parseNumber(row[valueCol]) ?? 0));
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([h, value]) => ({ label: `${String(h).padStart(2, "0")}:00`, value }));
}

function buildWeekdaySeries(rows: RowRecord[], dateCol: string | null, valueCol: string | null): ChartPoint[] {
  if (!dateCol || !valueCol) return [];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const buckets = new Map<number, number>();
  for (const row of rows) {
    const d = parseDate(row[dateCol]); if (!d) continue;
    const day = d.getDay();
    buckets.set(day, (buckets.get(day) ?? 0) + (parseNumber(row[valueCol]) ?? 0));
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([day, value]) => ({ label: DAYS[day] ?? String(day), value }));
}

function buildCumulativeSeries(rows: RowRecord[], dateCol: string | null, valueCol: string | null): ChartPoint[] {
  const daily = buildDateSeries(rows, dateCol, valueCol, 30);
  let running = 0;
  return daily.map((p) => { running += p.value; return { ...p, value: running }; });
}

function buildNetFlowSeries(rows: RowRecord[], dateCol: string | null, creditCol: string | null, debitCol: string | null): ChartPoint[] {
  if (!dateCol || !creditCol || !debitCol) return [];
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const d = parseDate(row[dateCol]); if (!d) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const net = (parseNumber(row[creditCol]) ?? 0) - (parseNumber(row[debitCol]) ?? 0);
    buckets.set(k, (buckets.get(k) ?? 0) + net);
  }
  return Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-12).map(([label, value]) => ({ label, value }));
}

function buildBankExpenseCategories(rows: RowRecord[], columns: string[], valueCol: string | null): ChartPoint[] {
  const narCol = findColumn(columns, ["narration", "description", "remarks", "particular", "details"]);
  if (!narCol || !valueCol) return [];
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const text = norm(row[narCol]);
    let bucket = "Other";
    if (text.includes("rent") || text.includes("lease")) bucket = "Rent";
    else if (text.includes("upi") || text.includes("paytm") || text.includes("gpay") || text.includes("neft")) bucket = "UPI/NEFT";
    else if (text.includes("salary") || text.includes("payroll")) bucket = "Salary";
    else if (text.includes("tax") || text.includes("gst") || text.includes("tds")) bucket = "Tax/GST";
    else if (text.includes("atm") || text.includes("cash")) bucket = "Cash";
    else if (text.includes("interest") || text.includes("emi")) bucket = "Interest/EMI";
    else if (text.includes("utility") || text.includes("electricity")) bucket = "Utilities";
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + (parseNumber(row[valueCol]) ?? 0));
  }
  return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
}

function buildTopRecurringTransactions(rows: RowRecord[], columns: string[]): ChartPoint[] {
  const narCol = findColumn(columns, ["narration", "description", "remarks", "particular", "details"]);
  if (!narCol) return [];
  const buckets = new Map<string, number>();
  for (const row of rows) {
    const label = String(row[narCol] ?? "").trim() || "Unknown";
    buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label: label.length > 22 ? `${label.slice(0, 22)}…` : label, value }));
}

function buildOutstandingSeries(rows: RowRecord[], columns: string[]): ChartPoint[] {
  const custCol = findColumn(columns, ["customer", "client", "party", "account"]);
  const outCol = findColumn(columns, ["outstanding", "balance due", "receivable", "amount due", "due amount"]);
  if (!custCol || !outCol) return [];
  return buildCategorySeries(rows, custCol, outCol, 8);
}

function buildFallbackCountBar(rows: RowRecord[], columns: string[]): ChartPoint[] {
  const textCols = classifyTextColumns(columns, rows).all;
  return buildCountSeries(rows, textCols[0] ?? columns[0] ?? null, 8);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9: Per-Chart Reasoning
// ─────────────────────────────────────────────────────────────────────────────

function buildChartReasoning(
  chartId: string,
  _type: ChartType,
  shape: ShapeAuditResult,
  templateId: TemplateId
): string {
  const cv = Math.round(shape.cvScore * 100);
  const dd = Math.round(shape.avgDateDensity * 100);
  const lc = shape.lowCardinalityTextCols.length;

  const map: Record<string, string> = {
    "trend-primary": shape.hasTrend
      ? ` Date density ${dd}% · CV ${cv}% on primary metric — high variance across time signals meaningful growth. Stacked Area makes trajectory and acceleration unmistakable.`
      : " Primary trend anchor. Time-series area provides directional context even without high CV.",
    "trend-cumulative": ` Cumulative sum over time — reveals whether volume is accelerating or plateauing. CV ${cv}% suggests compounding patterns worth tracking for board narrative.`,
    "category-top": ` Horizontal bar (radius=0 — Power BI standard) — surfaces top contributors in a single ranked sweep.`,
    "category-secondary": ` A second categorical lens using a different dimension — reveals whether concentration risk spans multiple axes.`,
    "composition-share": lc > 0
      ? ` ${lc} text column${lc > 1 ? "s" : ""} with <12 unique values detected — Donut Chart exposes market-share concentration risk to a board audience in one glance.`
      : " Donut chart shows relative contribution split across the dominant categorical grouping.",
    "liquidity-flow": shape.hasLiquidity
      ? " Both Debit and Credit columns detected. Composed Chart overlays bars (volume) + line (net) — the standard format for cashflow audits and bank reconciliation."
      : " Composed chart for dual-metric flow — bars for primary volume, line for the secondary signal.",
    "running-balance": " Sequential running balance exposes liquidity health or stress — board audiences read stress from slope, not averages.",
    "net-flow": " Monthly net cashflow (Credit − Debit) — negative bars are immediately visible and flag months requiring management attention.",
    "volume-distribution": shape.hasVolumeDist
      ? ` Transaction/bill size histogram — reveals pricing concentration and outlier bands. 8 equal-width bins.`
      : " Value-size frequency histogram — exposes whether a few large transactions dominate.",
    "velocity-pattern": " Line chart de-emphasises magnitude, making trend direction and inflection points immediately readable.",
    "concentration-view": " Entity concentration — high % in one party signals dependency that board packs must surface explicitly.",
    "weekday-pattern": " Weekday distribution reveals operational rhythm. Retail datasets often show weekend spikes invisible in monthly aggregates.",
    "hourly-pattern": " Hourly peaks expose trading concentration. POS peak-hour revenue can exceed off-peak by 5× — essential for capacity decisions.",
    "payment-mix": " Payment mode distribution reflects customer behavior and settlement risk.",
    "item-frequency": " Item frequency by count (not value) reveals operational dependency — most ordered items regardless of ticket size.",
    "invoice-aging": " A/R by customer — identifies largest outstanding balances and concentration of credit risk.",
    "ledger-distribution": " Counterparty-level distribution exposes which parties dominate the ledger.",
  };

  return map[chartId] ?? ` Routed by the DNA Insight Engine for '${templateId}' pattern. CV=${cv}% · Date density=${dd}%.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10: Template Strategies
// ─────────────────────────────────────────────────────────────────────────────

function R(id: string, type: ChartType, title: string, desc: string, shape: ShapeAuditResult, tpl: TemplateId): DashboardChart {
  return { id, type, title, description: desc, reasoning: buildChartReasoning(id, type, shape, tpl) };
}

function buildBankStrategy(columns: string[], rows: RowRecord[], shape: ShapeAuditResult): StrategyBase {
  const dateCol = findColumn(columns, ["date", "value date", "txn date", "posting date"]);
  const debitCol = findColumn(columns, ["debit", "withdrawal", "outflow"]);
  const creditCol = findColumn(columns, ["credit", "deposit", "inflow"]);
  const inflow = rows.reduce((s, r) => s + (creditCol ? parseNumber(r[creditCol]) ?? 0 : 0), 0);
  const outflow = rows.reduce((s, r) => s + (debitCol ? parseNumber(r[debitCol]) ?? 0 : 0), 0);
  const tpl: TemplateId = "bank";
  return {
    resolvedTemplate: tpl,
    kpis: [
      { id: "inflow", label: "Total Inflow", value: formatCompact(inflow) },
      { id: "outflow", label: "Total Outflow", value: formatCompact(outflow) },
      { id: "net", label: "Net Flow", value: formatCompact(inflow - outflow) },
      { id: "txns", label: "Transactions", value: rows.length.toLocaleString("en-IN") },
    ],
    charts: [
      R("running-balance", "line", "Running Cash Balance", "Sequential balance movement — stress visible from slope.", shape, tpl),
      R("liquidity-flow", "composed", "Inflow vs Outflow", "Daily debit/credit overlay — bar + line format.", shape, tpl),
      R("net-flow", "bar", "Monthly Net Cashflow", "Credit − Debit per month. Negative bars signal stress.", shape, tpl),
      R("composition-share", "pie", "Spend Mix by Category", "Narration-derived expense buckets.", shape, tpl),
      R("volume-distribution", "histogram", "Transaction Size Frequency", "Bill size distribution — 8 equal-width bands.", shape, tpl),
      R("concentration-view", "bar", "Outflow Concentration", "Top expense categories by total outflow.", shape, tpl),
      R("velocity-pattern", "area", "Monthly Flow Velocity", "Directional cashflow over time.", shape, tpl),
      R("category-top", "bar", "Top Recurring Transactions", "Most frequent narration strings by count.", shape, tpl),
    ],
    transformedData: {
      "running-balance": buildRunningBalance(rows, dateCol, creditCol, debitCol),
      "liquidity-flow": buildComposedFlow(rows, dateCol, debitCol, creditCol),
      "net-flow": buildNetFlowSeries(rows, dateCol, creditCol, debitCol),
      "composition-share": buildBankExpenseCategories(rows, columns, debitCol ?? creditCol),
      "volume-distribution": buildHistogram(rows, debitCol ?? creditCol),
      "concentration-view": buildBankExpenseCategories(rows, columns, debitCol ?? creditCol),
      "velocity-pattern": buildMonthSeries(rows, dateCol, creditCol ?? debitCol, 12),
      "category-top": buildTopRecurringTransactions(rows, columns),
    },
  };
}

function buildTallyLedgerStrategy(columns: string[], rows: RowRecord[], shape: ShapeAuditResult): StrategyBase {
  const dateCol = findColumn(columns, ["date", "voucher date", "entry date"]);
  const debitCol = findColumn(columns, ["debit", "dr", "withdrawal"]);
  const creditCol = findColumn(columns, ["credit", "cr", "deposit"]);
  const partyCol = findColumn(columns, ["party", "ledger", "account", "name"]);
  const totalDebit = rows.reduce((s, r) => s + (debitCol ? parseNumber(r[debitCol]) ?? 0 : 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (creditCol ? parseNumber(r[creditCol]) ?? 0 : 0), 0);
  const tpl: TemplateId = "tally-ledger";
  return {
    resolvedTemplate: tpl,
    kpis: [
      { id: "debit", label: "Total Debit", value: formatCompact(totalDebit) },
      { id: "credit", label: "Total Credit", value: formatCompact(totalCredit) },
      { id: "net", label: "Net Movement", value: formatCompact(totalCredit - totalDebit) },
      { id: "txns", label: "Entries", value: rows.length.toLocaleString("en-IN") },
    ],
    charts: [
      R("liquidity-flow", "composed", "Debit vs Credit", "Comparative movement across posting periods.", shape, tpl),
      R("running-balance", "line", "Running Balance", "Sequential balance — slope shows net position.", shape, tpl),
      R("net-flow", "bar", "Monthly Net Movement", "Credit − Debit per month — directional health.", shape, tpl),
      R("composition-share", "pie", "Top Parties by Volume", "Party concentration in total ledger value.", shape, tpl),
      R("ledger-distribution", "bar", "Counterparty Distribution", "Party-level debit/credit split.", shape, tpl),
      R("velocity-pattern", "area", "Monthly Flow Velocity", "Monthly aggregated movement trend.", shape, tpl),
      R("concentration-view", "bar", "Top Debit Counterparties", "Who receives the most debit postings.", shape, tpl),
    ],
    transformedData: {
      "liquidity-flow": buildComposedFlow(rows, dateCol, debitCol, creditCol),
      "running-balance": buildRunningBalance(rows, dateCol, creditCol, debitCol),
      "net-flow": buildNetFlowSeries(rows, dateCol, creditCol, debitCol),
      "composition-share": buildCategorySeries(rows, partyCol, debitCol ?? creditCol, 6),
      "ledger-distribution": buildCategorySeries(rows, partyCol, debitCol ?? creditCol, 8),
      "velocity-pattern": buildMonthSeries(rows, dateCol, creditCol ?? debitCol, 12),
      "concentration-view": buildCategorySeries(rows, partyCol, debitCol ?? creditCol, 8),
    },
  };
}

function buildZohoStrategy(columns: string[], rows: RowRecord[], shape: ShapeAuditResult): StrategyBase {
  const dateCol = findColumn(columns, ["invoice date", "date", "created date"]);
  const customerCol = findColumn(columns, ["customer", "client", "party", "contact"]);
  const amountCol = findColumn(columns, ["invoice total", "net amount", "grand total", "total amount", "amount", "sales"]);
  const total = rows.reduce((s, r) => s + (amountCol ? parseNumber(r[amountCol]) ?? 0 : 0), 0);
  const uniqCustomers = customerCol ? new Set(rows.map((r) => String(r[customerCol!] ?? ""))).size : 0;
  const tpl: TemplateId = "zoho";
  return {
    resolvedTemplate: tpl,
    kpis: [
      { id: "invoiced", label: "Invoiced Amount", value: formatCompact(total) },
      { id: "customers", label: "Customers", value: uniqCustomers.toLocaleString("en-IN") },
      { id: "invoices", label: "Invoices", value: rows.length.toLocaleString("en-IN") },
      { id: "avg", label: "Avg Invoice", value: rows.length ? formatCompact(total / rows.length) : "—" },
    ],
    charts: [
      R("trend-primary", "area", "Monthly Revenue Trend", "Monthly invoiced value — direction and acceleration.", shape, tpl),
      R("trend-cumulative", "line", "Cumulative Revenue", "YTD running total — compounding or plateauing.", shape, tpl),
      R("category-top", "bar", "Top Customers by Revenue", "Largest customers ranked by total invoiced amount.", shape, tpl),
      R("composition-share", "pie", "Customer Concentration", "Revenue share — market dependency risk.", shape, tpl),
      R("invoice-aging", "bar", "Accounts Receivable", "Outstanding amounts by customer — A/R concentration.", shape, tpl),
      R("volume-distribution", "histogram", "Invoice Size Distribution", "Frequency of invoice value bands.", shape, tpl),
      R("velocity-pattern", "line", "Invoice Velocity", "Invoice value movement — momentum signal.", shape, tpl),
      R("concentration-view", "bar", "Invoice Count by Customer", "Activity frequency — who transacts most often.", shape, tpl),
    ],
    transformedData: {
      "trend-primary": buildMonthSeries(rows, dateCol, amountCol, 12),
      "trend-cumulative": buildCumulativeSeries(rows, dateCol, amountCol),
      "category-top": buildCategorySeries(rows, customerCol, amountCol, 8),
      "composition-share": buildCategorySeries(rows, customerCol, amountCol, 6),
      "invoice-aging": buildOutstandingSeries(rows, columns),
      "volume-distribution": buildHistogram(rows, amountCol),
      "velocity-pattern": buildDateSeries(rows, dateCol, amountCol, 20),
      "concentration-view": buildCountSeries(rows, customerCol, 8),
    },
  };
}

function buildPosStrategy(columns: string[], rows: RowRecord[], shape: ShapeAuditResult): StrategyBase {
  const dateCol = findColumn(columns, ["time", "date", "bill time", "invoice time", "txn time"]);
  const amountCol = findColumn(columns, ["bill amount", "invoice total", "net amount", "grand total", "total amount", "sales", "amount"]);
  const paymentCol = findColumn(columns, ["payment mode", "payment", "mode", "tender"]);
  const itemCol = findColumn(columns, ["item", "product", "stock item", "sku", "category"]);
  const totalSales = rows.reduce((s, r) => s + (amountCol ? parseNumber(r[amountCol]) ?? 0 : 0), 0);
  const uniqItems = itemCol ? new Set(rows.map((r) => String(r[itemCol!] ?? ""))).size : 0;
  const tpl: TemplateId = "pos";
  return {
    resolvedTemplate: tpl,
    kpis: [
      { id: "sales", label: "Total Sales", value: formatCompact(totalSales) },
      { id: "bills", label: "Bills", value: rows.length.toLocaleString("en-IN") },
      { id: "items", label: "SKUs", value: uniqItems.toLocaleString("en-IN") },
      { id: "avg", label: "Avg Bill", value: rows.length ? formatCompact(totalSales / rows.length) : "—" },
    ],
    charts: [
      R("hourly-pattern", "bar", "Hourly Sales Peaks", "Sales by hour — peak trading concentration.", shape, tpl),
      R("weekday-pattern", "bar", "Weekday Revenue Pattern", "Which days drive the most volume.", shape, tpl),
      R("category-top", "bar", "Top Items by Revenue", "Best-performing retail items or categories.", shape, tpl),
      R("payment-mix", "pie", "Payment Mode Mix", "UPI vs Cash vs Card — digital adoption signal.", shape, tpl),
      R("volume-distribution", "histogram", "Bill Value Distribution", "Basket size frequency — 8 bands.", shape, tpl),
      R("velocity-pattern", "area", "Daily Sales Velocity", "Daily cumulative view — promotion effects.", shape, tpl),
      R("item-frequency", "bar", "Item Transaction Frequency", "Most-ordered items by count.", shape, tpl),
      R("trend-primary", "area", "Monthly Revenue Trend", "Month-over-month sales — board narrative.", shape, tpl),
    ],
    transformedData: {
      "hourly-pattern": buildHourlySeries(rows, dateCol, amountCol),
      "weekday-pattern": buildWeekdaySeries(rows, dateCol, amountCol),
      "category-top": buildCategorySeries(rows, itemCol, amountCol, 8),
      "payment-mix": buildCategorySeries(rows, paymentCol, amountCol, 6),
      "volume-distribution": buildHistogram(rows, amountCol),
      "velocity-pattern": buildDateSeries(rows, dateCol, amountCol, 20),
      "item-frequency": buildCountSeries(rows, itemCol, 8),
      "trend-primary": buildMonthSeries(rows, dateCol, amountCol, 12),
    },
  };
}

function buildTallySalesStrategy(columns: string[], rows: RowRecord[], shape: ShapeAuditResult): StrategyBase {
  const dateCol = findColumn(columns, ["invoice date", "date", "bill date"]);
  const amountCol = findColumn(columns, ["invoice total", "net amount", "grand total", "total amount", "sales", "amount"]);
  const itemCol = findColumn(columns, ["item", "product", "stock item", "category"]);
  const customerCol = findColumn(columns, ["customer", "party", "client", "name"]);
  const total = rows.reduce((s, r) => s + (amountCol ? parseNumber(r[amountCol]) ?? 0 : 0), 0);
  const uniqCust = customerCol ? new Set(rows.map((r) => String(r[customerCol!] ?? ""))).size : 0;
  const tpl: TemplateId = "tally-sales";
  return {
    resolvedTemplate: tpl,
    kpis: [
      { id: "sales", label: "Total Sales", value: formatCompact(total) },
      { id: "customers", label: "Customers", value: uniqCust.toLocaleString("en-IN") },
      { id: "items", label: "Items", value: itemCol ? new Set(rows.map((r) => String(r[itemCol!] ?? ""))).size.toLocaleString("en-IN") : "—" },
      { id: "rows", label: "Invoices", value: rows.length.toLocaleString("en-IN") },
    ],
    charts: [
      R("trend-primary", "area", "Daily Revenue Trend", "Revenue movement across billing dates.", shape, tpl),
      R("trend-cumulative", "line", "Cumulative Sales", "Running total — compounding or plateauing growth.", shape, tpl),
      R("category-top", "bar", "Top Items by Revenue", "Best-performing products or stock items.", shape, tpl),
      R("composition-share", "pie", "Customer Revenue Share", "Customer concentration — dependency and risk.", shape, tpl),
      R("volume-distribution", "histogram", "Invoice Size Distribution", "Frequency of invoice value bands.", shape, tpl),
      R("velocity-pattern", "line", "Monthly Revenue Velocity", "Directional revenue — acceleration or deceleration.", shape, tpl),
      R("category-secondary", "bar", "Customer Revenue Rank", "Top customers by total billings.", shape, tpl),
      R("concentration-view", "bar", "Item Transaction Frequency", "Most repeated items — stock negotiation signal.", shape, tpl),
    ],
    transformedData: {
      "trend-primary": buildDateSeries(rows, dateCol, amountCol),
      "trend-cumulative": buildCumulativeSeries(rows, dateCol, amountCol),
      "category-top": buildCategorySeries(rows, itemCol, amountCol, 8),
      "composition-share": buildCategorySeries(rows, customerCol, amountCol, 6),
      "volume-distribution": buildHistogram(rows, amountCol),
      "velocity-pattern": buildMonthSeries(rows, dateCol, amountCol, 12),
      "category-secondary": buildCategorySeries(rows, customerCol, amountCol, 8),
      "concentration-view": buildCountSeries(rows, itemCol, 8),
    },
  };
}

function buildGenericStrategy(columns: string[], rows: RowRecord[], shape: ShapeAuditResult): StrategyBase {
  const numericCols = findNumericColumns(columns, rows);
  const textBuckets = classifyTextColumns(columns, rows);
  const dateCols = detectDateColumns(columns, rows);
  const dateCol = dateCols[0] ?? findColumn(columns, ["date", "time", "month", "year"]);
  const primaryNumeric = numericCols[0] ?? null;
  const secondaryNumeric = numericCols[1] ?? null;
  const primaryText = textBuckets.all[0] ?? null;
  const secondaryText = textBuckets.all[1] ?? primaryText;
  const lowCardText = textBuckets.low[0] ?? primaryText;
  const total = primaryNumeric ? rows.reduce((s, r) => s + (parseNumber(r[primaryNumeric]) ?? 0), 0) : 0;
  const tpl: TemplateId = "generic";

  const baseCharts: DashboardChart[] = [
    R("trend-primary", dateCol && primaryNumeric ? "area" : "bar", "Primary Trend", "Best-fit trend using strongest detected time + metric.", shape, tpl),
    R("category-top", "bar", "Top Groups", "Highest-contributing categories against primary metric.", shape, tpl),
    R("composition-share", "pie", "Contribution Split", "Market share across dominant categorical grouping.", shape, tpl),
    R("volume-distribution", "histogram", "Value Distribution", "Frequency histogram — 8 equal-width bands.", shape, tpl),
    R("velocity-pattern", dateCol && primaryNumeric ? "line" : "bar", "Velocity Pattern", "Directional movement — inflection points visible.", shape, tpl),
    R("concentration-view", "bar", "Concentration View", "Operational exposure — reveals dependency risk.", shape, tpl),
  ];

  if (secondaryNumeric) {
    baseCharts.push(R("category-secondary", "bar", "Secondary Metric Groups", "Top groups by secondary numeric column.", shape, tpl));
  }
  if (textBuckets.low.length > 0) {
    baseCharts.push(R("trend-cumulative", "line", "Cumulative Primary", "Running total — compounding or plateau signal.", shape, tpl));
  }

  return {
    resolvedTemplate: tpl,
    kpis: [
      { id: "rows", label: "Rows", value: rows.length.toLocaleString("en-IN") },
      { id: "columns", label: "Columns", value: columns.length.toLocaleString("en-IN") },
      { id: "value", label: "Primary Value", value: primaryNumeric ? formatCompact(total) : "—" },
      { id: "signals", label: "Signals", value: String(numericCols.length + dateCols.length + textBuckets.all.length) },
    ],
    charts: baseCharts.slice(0, 8),
    transformedData: {
      "trend-primary": dateCol && primaryNumeric ? buildDateSeries(rows, dateCol, primaryNumeric) : buildFallbackCountBar(rows, columns),
      "category-top": primaryText && primaryNumeric ? buildCategorySeries(rows, primaryText, primaryNumeric, 8) : buildFallbackCountBar(rows, columns),
      "composition-share": lowCardText && primaryNumeric ? buildCategorySeries(rows, lowCardText, primaryNumeric, 6) : buildFallbackCountBar(rows, columns),
      "volume-distribution": primaryNumeric ? buildHistogram(rows, primaryNumeric) : buildFallbackCountBar(rows, columns),
      "velocity-pattern": dateCol && primaryNumeric ? buildMonthSeries(rows, dateCol, primaryNumeric, 12) : buildFallbackCountBar(rows, columns),
      "concentration-view": primaryText ? buildCountSeries(rows, primaryText, 8) : buildFallbackCountBar(rows, columns),
      "category-secondary": secondaryNumeric && secondaryText ? buildCategorySeries(rows, secondaryText, secondaryNumeric, 8) : [],
      "trend-cumulative": dateCol && primaryNumeric ? buildCumulativeSeries(rows, dateCol, primaryNumeric) : [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11: Routing & Audit
// ─────────────────────────────────────────────────────────────────────────────

function routeAutoTemplate(columns: string[], rows: RowRecord[], audit?: DataAudit | null): TemplateId {
  const pat = norm(audit?.detectedPattern);
  if (pat.includes("cashflow") || pat.includes("bank")) return "bank";
  if (pat.includes("retail") || pat.includes("pos")) return "pos";
  if (pat.includes("subscription")) return "excel";
  if (pat.includes("receivable") || pat.includes("zoho")) return "zoho";

  const sigs = buildBaseModelSignals(columns, rows);
  if (sigs.inferredPattern === "Complex Cashflow") return "bank";
  if (sigs.inferredPattern === "High-Velocity Retail") return "pos";
  if (sigs.inferredPattern === "Receivables Exposure") return "zoho";
  if (sigs.inferredPattern === "Revenue Operations") return "tally-sales";
  if (sigs.inferredPattern === "Subscription Burn") return "excel";

  const hasDebit = !!findColumn(columns, ["debit", "withdrawal", "dr"]);
  const hasCredit = !!findColumn(columns, ["credit", "deposit", "cr"]);
  const hasInvoice = !!findColumn(columns, ["invoice", "invoice number", "invoice no"]);
  const hasCustomer = !!findColumn(columns, ["customer", "client", "party"]);

  if (hasDebit && hasCredit) return "tally-ledger";
  if (hasInvoice && hasCustomer) return "zoho";
  return "generic";
}

function buildTemplateStrategy(template: TemplateId, columns: string[], rows: RowRecord[], shape: ShapeAuditResult): StrategyBase {
  if (template === "tally-sales") return buildTallySalesStrategy(columns, rows, shape);
  if (template === "tally-ledger") return buildTallyLedgerStrategy(columns, rows, shape);
  if (template === "zoho") return buildZohoStrategy(columns, rows, shape);
  if (template === "pos") return buildPosStrategy(columns, rows, shape);
  if (template === "bank") return buildBankStrategy(columns, rows, shape);
  return buildGenericStrategy(columns, rows, shape);
}

function buildBaseAudit(resolvedTemplate: TemplateId, signals: BaseModelSignals, shape: ShapeAuditResult): DataAudit {
  const cv = Math.round(shape.cvScore * 100);
  const dd = Math.round(shape.avgDateDensity * 100);
  const parts: string[] = [];
  if (shape.hasTrend) parts.push(`date-driven trend (CV=${cv}%, density=${dd}%)`);
  if (shape.hasConcentration) parts.push(`${shape.lowCardinalityTextCols.length} low-cardinality dimensions`);
  if (shape.hasLiquidity) parts.push("debit/credit liquidity columns");
  if (shape.hasVolumeDist) parts.push("transaction volume distribution");
  if (shape.hasMultiMetric) parts.push(`${signals.numericCount} numeric columns`);
  const summary = parts.length ? `Detected: ${parts.join(" · ")}.` : "No dominant structural signals — balanced enterprise layout.";

  const map: Record<TemplateId, string> = {
    bank: `Debit, Credit, and Narration columns structurally detected — bank/cashflow fingerprint. ${summary} Cashflow balance, spend-mix, and recurring-transaction visuals provide highest analytic value.`,
    pos: `High-frequency rows with Item, Payment Mode, and Amount — POS/retail fingerprint. ${summary} Hourly peaks, weekday patterns, payment mix, and basket-size distribution are the core evidence set.`,
    zoho: `Invoice, Customer, and Amount columns — Zoho Books/receivables fingerprint. ${summary} Revenue trend, customer concentration, and A/R aging tell the most complete story.`,
    "tally-sales": `Invoice Date, Item, and Customer — Tally Sales fingerprint. ${summary} Revenue velocity, item performance, and customer concentration are the priority views.`,
    "tally-ledger": `Debit, Credit, and Party/Ledger — Tally Ledger fingerprint. ${summary} Running balance, counterparty distribution, and net movement are the essential audit visuals.`,
    excel: `General workbook — no strong domain fingerprint. ${summary} Broad trend-category-share layout provides the most versatile board narrative.`,
    generic: `Mixed operational dataset — no single pattern dominated. ${summary} Balanced trend-category-distribution layout surfaces the most evidence from available signals.`,
    auto: `Auto-detection resolved. ${summary}`,
  };

  return { detectedPattern: signals.inferredPattern, recommendedCharts: [], reasoning: map[resolvedTemplate] ?? map.generic, source: "heuristic" };
}

function mergeAudit(baseAudit: DataAudit, externalAudit?: DataAudit | null): DataAudit {
  if (!externalAudit) return baseAudit;
  const hasAiReasoning = !!(externalAudit.reasoning?.trim());
  return {
    detectedPattern:   externalAudit.detectedPattern  || baseAudit.detectedPattern,
    recommendedCharts: externalAudit.recommendedCharts?.filter(Boolean).length
      ? externalAudit.recommendedCharts
      : baseAudit.recommendedCharts,
    // AI narrative takes priority — this is what appears in VisualDesign card footer
    reasoning: hasAiReasoning ? externalAudit.reasoning : baseAudit.reasoning,
    source:    hasAiReasoning
      ? (externalAudit.source ?? "merged")
      : "heuristic",
  };
}


function selectRecommendedChartIds(charts: DashboardChart[], audit: DataAudit, shape: ShapeAuditResult): string[] {
  const all = charts.map((c) => c.id);
  const external = (audit.recommendedCharts ?? []).filter((id) => all.includes(id));
  if (external.length) return external.slice(0, 8);

  const priority: string[] = [];
  if (shape.hasTrend) priority.push("trend-primary", "trend-cumulative");
  if (shape.hasLiquidity) priority.push("liquidity-flow", "running-balance", "net-flow");
  if (shape.hasConcentration) priority.push("composition-share");
  if (shape.hasVolumeDist) priority.push("volume-distribution");
  priority.push("category-top", "velocity-pattern", "concentration-view", "category-secondary");

  return [...new Set([...priority, ...all])].filter((id) => all.includes(id)).slice(0, 8);
}

function applyAnomalyFlags(
  charts: DashboardChart[],
  transformedData: Record<string, ChartPoint[]>
): DashboardChart[] {
  return charts.map((chart) => {
    const result = detectSeriesAnomaly(transformedData[chart.id] ?? []);
    return { ...chart, hasAnomaly: result.hasAnomaly, anomalyPeak: result.anomalyPeak };
  });
}

// ── NEW: Hybrid Reasoning Injection ───────────────────────────────────────────
// If the AI audit has a reasoning string, inject it as a prefix to chart.reasoning
// so VisualDesign card footers show AI context, not just heuristic text.
function applyAiReasoningToCharts(
  charts: DashboardChart[],
  audit: DataAudit,
  recommendedIds: string[]
): DashboardChart[] {
  const aiReasoning = audit.reasoning?.trim();
  const isAiSource =
    audit.source === "merged" ||
    audit.source === "gemini-only" ||
    audit.source === "openrouter-only";

  if (!aiReasoning || !isAiSource) return charts;

  // Only inject AI reasoning prefix on charts the AI specifically recommended
  const aiRecommendedSet = new Set(audit.recommendedCharts ?? recommendedIds);

  return charts.map((chart) => {
    if (!aiRecommendedSet.has(chart.id)) return chart;
    // Keep heuristic reasoning as fallback suffix
    const heuristicSuffix = chart.reasoning ? ` · ${chart.reasoning}` : "";
    return {
      ...chart,
      reasoning: `${aiReasoning}${heuristicSuffix}`,
    };
  });
}

// ── NEW: Hybrid Decision Engine — forced chart injection ──────────────────────
// When AI detects a specific pattern, certain charts MUST be present
// regardless of what the heuristic template selected.
// This bridges AI pattern recognition with deterministic visual routing.
function injectRequiredCharts(
  charts: DashboardChart[],
  transformedData: Record<string, ChartPoint[]>,
  audit: DataAudit,
  columns: string[],
  sampleRows: RowRecord[],
  shape: ShapeAuditResult
): { charts: DashboardChart[]; transformedData: Record<string, ChartPoint[]> } {
  const pattern = norm(audit.detectedPattern);
  const existingIds = new Set(charts.map((c) => c.id));

  const extraCharts: DashboardChart[]          = [];
  const extraData: Record<string, ChartPoint[]> = {};

  // ── Rule 1: Complex Cashflow pattern → always include liquidity-flow + net-flow
  if (pattern.includes("cashflow") || pattern.includes("bank") || pattern.includes("complex")) {
    const dateCol   = findColumn(columns, ["date", "value date", "txn date", "posting date"]);
    const debitCol  = findColumn(columns, ["debit", "withdrawal", "outflow", "dr"]);
    const creditCol = findColumn(columns, ["credit", "deposit", "inflow", "cr"]);

    if (!existingIds.has("liquidity-flow") && debitCol && creditCol) {
      extraCharts.push({
        id:          "liquidity-flow",
        type:        "composed",
        title:       "Inflow vs Outflow",
        description: "Daily debit/credit overlay — bar + line format.",
        reasoning:   buildChartReasoning("liquidity-flow", "composed", shape, "bank"),
      });
      extraData["liquidity-flow"] = buildComposedFlow(sampleRows, dateCol, debitCol, creditCol);
    }

    if (!existingIds.has("net-flow") && debitCol && creditCol) {
      extraCharts.push({
        id:          "net-flow",
        type:        "bar",
        title:       "Monthly Net Cashflow",
        description: "Credit − Debit per month. Negative bars signal stress.",
        reasoning:   buildChartReasoning("net-flow", "bar", shape, "bank"),
      });
      extraData["net-flow"] = buildNetFlowSeries(sampleRows, dateCol, creditCol, debitCol);
    }
  }

  // ── Rule 2: Receivables Exposure → always include invoice-aging
  if (pattern.includes("receivable") || pattern.includes("zoho")) {
    if (!existingIds.has("invoice-aging")) {
      extraCharts.push({
        id:          "invoice-aging",
        type:        "bar",
        title:       "Accounts Receivable Aging",
        description: "Outstanding amounts by customer — A/R concentration.",
        reasoning:   buildChartReasoning("invoice-aging", "bar", shape, "zoho"),
      });
      extraData["invoice-aging"] = buildOutstandingSeries(sampleRows, columns);
    }
  }

  // ── Rule 3: High-Velocity Retail → always include hourly-pattern
  if (pattern.includes("retail") || pattern.includes("pos")) {
    const dateCol   = findColumn(columns, ["time", "date", "bill time", "txn time"]);
    const amountCol = findColumn(columns, ["bill amount", "amount", "sales", "total"]);
    if (!existingIds.has("hourly-pattern")) {
      extraCharts.push({
        id:          "hourly-pattern",
        type:        "bar",
        title:       "Hourly Sales Peaks",
        description: "Sales by hour — peak trading concentration.",
        reasoning:   buildChartReasoning("hourly-pattern", "bar", shape, "pos"),
      });
      extraData["hourly-pattern"] = buildHourlySeries(sampleRows, dateCol, amountCol);
    }
  }

  if (!extraCharts.length) return { charts, transformedData };

  // Prepend forced charts to the front (strategic priority)
  return {
    charts:          [...extraCharts, ...charts].slice(0, 8),
    transformedData: { ...extraData, ...transformedData },
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12: Model-Agnostic LLM Bridge
// ─────────────────────────────────────────────────────────────────────────────

function readLlmBridgeAudit(): DataAudit | null {
  try {
    const raw =
      (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_LLM_AUDIT_METADATA) ||
      (typeof process !== "undefined" && (process.env?.REACT_APP_LLM_AUDIT_METADATA || process.env?.NEXT_PUBLIC_LLM_AUDIT_METADATA)) ||
      null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return null;
    return {
      detectedPattern: typeof parsed.detectedPattern === "string" ? parsed.detectedPattern : undefined,
      recommendedCharts: Array.isArray(parsed.recommendedCharts) ? parsed.recommendedCharts : undefined,
      reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
      source: "llm-bridge",
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 13: Main Entry Point — Hybrid Intelligence v4.0
// ─────────────────────────────────────────────────────────────────────────────

export function getTemplateStrategy(
  template: TemplateId,
  columns: string[],
  rows: RowRecord[],
  schema?: ColumnProfile[] | null,
  // Accepts either DataAudit (legacy) or CombinedAuditInput (from useDualAudit)
  auditInput?: DataAudit | CombinedAuditInput | null,
  pinnedChartIds?: string[]
): VisualStrategy {

  // ── 1. Always bound to 800-row sample — data privacy + perf ───────────────
  const sampleRows = smartSample(rows, 800);

  // ── 2. Shape audit on sample only ─────────────────────────────────────────
  const shape   = runDataShapeAudit(columns, sampleRows);
  const signals = buildBaseModelSignals(columns, sampleRows);

  // ── 3. Normalise auditInput → DataAudit ───────────────────────────────────
  // CombinedAuditInput has executiveSummary/primarySignals — normalise to DataAudit
  const normalisedAuditInput: DataAudit | null = auditInput
    ? "executiveSummary" in auditInput || "primarySignals" in auditInput
      ? fromCombinedAudit(auditInput as CombinedAuditInput)
      : (auditInput as DataAudit)
    : null;

  // ── 4. Route template (AI pattern overrides heuristic if present) ─────────
  const routedTemplate =
    template === "auto"
      ? routeAutoTemplate(columns, sampleRows, normalisedAuditInput)
      : template;

  // ── 5. Build deterministic base strategy ──────────────────────────────────
  const base = buildTemplateStrategy(routedTemplate, columns, sampleRows, shape);

  // ── 6. Build heuristic audit, merge with AI audit ─────────────────────────
  const heuristicAudit = buildBaseAudit(base.resolvedTemplate, signals, shape);
  const llmBridgeAudit = readLlmBridgeAudit();
  const externalAudit  = normalisedAuditInput ?? llmBridgeAudit;
  const audit          = mergeAudit(heuristicAudit, externalAudit);

  // ── 7. AI recommendedCharts → strategic priority ordering ─────────────────
  const recommendedIds = selectRecommendedChartIds(base.charts, audit, shape);
  audit.recommendedCharts = recommendedIds;

  // ── 8. Anomaly detection on all series ────────────────────────────────────
  let chartsWithMeta = applyAnomalyFlags(base.charts, base.transformedData);

  // ── 9. Hybrid Decision Engine: inject required charts from AI pattern ──────
  const injected = injectRequiredCharts(
    chartsWithMeta,
    base.transformedData,
    audit,
    columns,
    sampleRows,
    shape
  );
  chartsWithMeta = injected.charts;
  const finalTransformedData = injected.transformedData;

  // ── 10. Map AI narrative reasoning → chart.reasoning for VisualDesign ─────
  const chartsWithReasoning = applyAiReasoningToCharts(
    chartsWithMeta,
    audit,
    recommendedIds
  );

  // ── 11. Pinned chart filtering ─────────────────────────────────────────────
  const allIds       = chartsWithReasoning.map((c) => c.id);
  const finalPinned  = (pinnedChartIds?.filter((id) => allIds.includes(id)) ?? []).slice(0, 8);

  return {
    resolvedTemplate: base.resolvedTemplate,
    charts:           chartsWithReasoning,
    kpis:             base.kpis,
    transformedData:  finalTransformedData,
    pinnedChartIds:   finalPinned.length ? finalPinned : recommendedIds.slice(0, 4),
    audit,
    signals,
  };
}
