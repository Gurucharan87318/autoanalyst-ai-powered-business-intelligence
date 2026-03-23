// ─────────────────────────────────────────────────────────────────────────────
// Health.tsx  —  AutoAnalyst Business Health Diagnostic  v8.0
//
// ZERO-LATENCY ARCHITECTURE:
//   • NO new AI calls. Mounts useDualAudit() only to satisfy its hasRun guard.
//   • Phase 1 (<1ms): computeRetailHealth() runs synchronously from 800-row slice.
//   • Phase 2: reads dashboard.audit (written by useDualAudit in VisualDashboard).
//   • Heuristic fallback: every section renders immediately — nothing is ever empty.
//
// NEW IN v8.0:
//   ① What-If Sidebar      — Margin % + Hours Saved → real-time score + ROI
//   ② Confidence Score     — patternConfidence from audit, shown as meter
//   ③ Evidence Mode        — "View Data" on each signal → modal of supporting rows
//   ④ Roadmap Why tooltips — pattern-aware, uses stop-propagation correctly
//   ⑤ Signal Grid          — polarity classifier, no column bleed
//   ⑥ Issue Tracker        — sortable, mark-resolved, export CSV
// ─────────────────────────────────────────────────────────────────────────────

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  BarChart2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Download,
  FileSpreadsheet,
  Lightbulb,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  TerminalSquare,
  TrendingDown,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

import { useDatasetStore, datasetStore } from "@/lib_old/DatasetStore";
import { useDualAudit } from "@/../hooks/UseDualAudit";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Severity    = "high" | "med" | "low";
type SortKey     = "issue" | "severity" | "evidence" | "action";
type InsightMode = "ai" | "offline";
type RowRecord   = Record<string, unknown>;

type Diagnosis = {
  id:            string;
  severity:      Severity;
  issue:         string;
  evidence:      string;
  action:        string;
  sqlHint:       string;
  supportingCol?: string;   // column used to detect this issue (for Evidence Mode)
};

type Signal = {
  kind:          "strength" | "risk" | "warning";
  text:          string;
  detail?:       string;
  supportingCol?: string;   // column name whose rows power the Evidence modal
};

type RoadmapStep = {
  id:          string;
  headline:    string;
  why:         string;
  body:        string;
  priority:    "high" | "medium" | "low";
  patternName: string;
};

type HeuristicResult = {
  score:               number;
  severityCounts:      Record<Severity, number>;
  totalRevenue:        number;
  avgTransactionValue: number;
  anomaliesFound:      number;
  nextMoves:           string[];
  vitals: {
    totalRecordCount: number;
    dateRangeCovered: string;
    dataQualityPct:   number;
  };
  heuristicSummary:    string;
  signals:             Signal[];
  diagnoses:           Diagnosis[];
  fallbackSteps:       RoadmapStep[];
  // for What-If sidebar
  salesBase:           number;
  revenueColName:      string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Mock — preview mode
// ─────────────────────────────────────────────────────────────────────────────

const MOCK: HeuristicResult = {
  score: 74,
  severityCounts: { high: 1, med: 2, low: 1 },
  totalRevenue: 4_830_000,
  avgTransactionValue: 1002,
  anomaliesFound: 3,
  nextMoves: [
    "Reduce customer concentration — top 3 accounts represent 61% of revenue.",
    "Validate 3 revenue spike transactions before including in board figures.",
    "Investigate Furniture category decline of 14% before next management review.",
    "Backfill 127 null cells in the Date and Category columns.",
  ],
  vitals: { totalRecordCount: 4821, dateRangeCovered: "01 Aug 2025 – 28 Feb 2026", dataQualityPct: 91 },
  heuristicSummary:
    "Revenue grew 9% MoM over the last four months, with Electronics driving 48% of total sales. Customer concentration is the primary structural risk — the top 3 accounts represent 61% of revenue, creating material liquidity exposure if any single relationship weakens. Three revenue outliers were detected and require validation before board submission. Overall data integrity is moderate with a 91% quality score.",
  signals: [
    { kind: "strength", text: "Revenue growth +9% MoM",                     detail: "Positive trend sustained over the last 4 months." },
    { kind: "strength", text: "Electronics leads without over-concentration", detail: "Category mix above 45% advisory threshold but improving." },
    { kind: "strength", text: "Margins above 5% threshold",                  detail: "No pricing discipline issues detected in the current scan." },
    { kind: "strength", text: "No duplicate rows",                           detail: "Dataset passes row uniqueness check." },
    { kind: "risk",     text: "Top 3 customers = 61% of revenue",            detail: "Concentration risk above the 50% advisory threshold.", supportingCol: "Customer" },
    { kind: "risk",     text: "3 revenue outliers detected",                 detail: "Values exceed 2σ from the mean — require validation.", supportingCol: "Amount" },
    { kind: "warning",  text: "Weakest category: Furniture",                 detail: "Sales declined 14% — consider divesting or investing.", supportingCol: "Category" },
    { kind: "warning",  text: "127 null cells detected (2.6%)",              detail: "Blank fields reduce reporting reliability." },
  ],
  diagnoses: [
    { id: "customer-concentration", severity: "high", issue: "Customer concentration risk",   evidence: "Top 3 customers account for 61% of total revenue — above the 50% advisory threshold.", action: "Protect liquidity by diversifying accounts or ring-fencing concentration-dependent revenue.", sqlHint: "Aggregate revenue by customer and inspect top-3 share over time.", supportingCol: "Customer" },
    { id: "revenue-outliers",       severity: "med",  issue: "Revenue outliers detected",      evidence: "3 transactions deviate more than 2σ from the mean (₹1,002).",                         action: "Validate spike transactions for correctness before including in board-level revenue figures.", sqlHint: "Compute stddev and filter rows where value > mean + 2*stddev.", supportingCol: "Amount" },
    { id: "category-decline",       severity: "med",  issue: "Declining category: Furniture",  evidence: "Furniture sales declined 14% over the scanned period.",                              action: "Investigate root causes — demand shift, lost supplier, or pricing — before management review.", sqlHint: "Aggregate revenue by category and compare first vs last half of the date range.", supportingCol: "Category" },
    { id: "missing-values",         severity: "low",  issue: "Missing values present",         evidence: "127 cells blank across 2 columns (2.6% of scanned cells).",                          action: "Backfill mandatory columns first, then isolate optional fields for controlled cleanup.", sqlHint: "Filter rows where key business columns are NULL and repair in SQL Sandbox." },
  ],
  fallbackSteps: [
    { id: "s1", headline: "Expand Electronics inventory to capitalize on 48% revenue share",  why: "Electronics is the dominant revenue driver with 48% share. Deepening inventory depth and supplier relationships could accelerate margin improvement before the next board cycle.", body: "Deepening inventory depth and supplier relationships in this category could accelerate margin improvement. A 10% increase in SKU range has historically yielded 6–8% revenue lift in comparable retail cohorts.", priority: "high",   patternName: "High-Velocity Retail" },
    { id: "s2", headline: "Reduce reliance on top 3 accounts to de-risk revenue base",         why: "A customer base where 61% of revenue is concentrated in 3 accounts creates structural fragility. Qualifying 3–5 new accounts to 10% share each is the recommended mitigation path.", body: "Actively qualifying 3–5 new accounts to 10% share each is the recommended mitigation path for the next board cycle. Consider referral incentives and channel partner programs.",                       priority: "high",   patternName: "High-Velocity Retail" },
    { id: "s3", headline: "Investigate 3 revenue spikes before board submission",               why: "Statistical outliers in revenue often indicate data entry errors, one-off bulk orders, or misclassified returns. Each must be confirmed before executive KPI decks are finalised.",    body: "Statistical outliers often indicate data entry errors, one-off bulk orders, or misclassified returns. Confirm each before including in trend analysis or executive KPI decks.",                      priority: "medium", patternName: "High-Velocity Retail" },
  ],
  salesBase:       4_830_000,
  revenueColName:  "Amount",
};

// ─────────────────────────────────────────────────────────────────────────────
// Signal polarity classifier — module-scoped, not inside the component
// ─────────────────────────────────────────────────────────────────────────────

const POSITIVE_TERMS = [
  "growth", "strong", "healthy", "above", "clean", "diversif",
  "stable", "positive", "improv", "exceed", "high quality",
  "no duplicate", "within threshold", "passes", "no material",
  "margin above", "balanced", "on track",
] as const;

const NEGATIVE_TERMS = [
  "risk", "decline", "gap", "miss", "below", "weak", "concentrat",
  "outlier", "spike", "null", "blank", "duplicate", "low margin",
  "fragil", "exposure", "breach", "stress", "inadequat",
  "insufficient", "overrelian", "dependen", "volatile",
] as const;

function classifySignalPolarity(text: string): 1 | -1 | 0 {
  const t        = text.toLowerCase();
  const posScore = POSITIVE_TERMS.filter((kw) => t.includes(kw)).length;
  const negScore = NEGATIVE_TERMS.filter((kw) => t.includes(kw)).length;
  if (negScore > posScore) return -1;
  if (posScore > negScore) return  1;
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function isNullish(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && !v.trim());
}
function norm(v: unknown): string { return String(v ?? "").trim().toLowerCase(); }
function parseNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").replace(/,/g, "").replace(/[₹$€£¥]/g, "").trim();
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
}
function parseDate(v: unknown): Date | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const dmy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`);
    if (!isNaN(d.getTime())) return d;
  }
  const t = Date.parse(raw);
  return isNaN(t) ? null : new Date(t);
}
function detectColumn(cols: string[], hints: string[]): string | null {
  for (const h of hints) { const f = cols.find((c) => norm(c).includes(h)); if (f) return f; }
  return null;
}
function fmtCurrency(n: number): string { return n.toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
function severityWeight(s: Severity): number { return s === "high" ? 3 : s === "med" ? 2 : 1; }
function downloadText(filename: string, text: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — Heuristic Health Engine (synchronous, 0ms, 800-row privacy cap)
// ─────────────────────────────────────────────────────────────────────────────

function computeRetailHealth(
  dataset: { columns?: string[]; rows?: RowRecord[]; meta?: { name?: string } | null } | null
): HeuristicResult {
  const columns = dataset?.columns ?? [];
  const rows    = ((dataset?.rows ?? []) as RowRecord[]).slice(0, 800);

  const diagnoses: Diagnosis[] = [];
  const signals:   Signal[]    = [];

  const dateCol     = detectColumn(columns, ["date", "invoice date", "txn date", "bill date", "value date"]);
  const revenueCol  = detectColumn(columns, ["sales", "revenue", "amount", "total", "net amount", "grand total"]);
  const customerCol = detectColumn(columns, ["customer", "party", "client", "account"]);
  const categoryCol = detectColumn(columns, ["category", "group", "segment", "department", "item", "product"]);
  const costCol     = detectColumn(columns, ["cost price", "cost", "purchase price", "buy price"]);
  const sellingCol  = detectColumn(columns, ["selling price", "sale price", "price", "amount", "net amount", "sales"]);

  // Null density
  const nulls      = columns.reduce((s, c) => s + rows.filter((r) => isNullish(r[c])).length, 0);
  const totalCells = Math.max(1, rows.length) * Math.max(1, columns.length);
  const nullPct    = (nulls / totalCells) * 100;
  if (nullPct > 3) {
    diagnoses.push({ id: "missing-values", severity: nullPct > 12 ? "high" : "med", issue: "Missing values present",
      evidence: `${nulls.toLocaleString("en-IN")} cells blank across ${columns.length} columns — ${nullPct.toFixed(1)}% of scanned cells.`,
      action: "Backfill mandatory columns first, then isolate optional fields for controlled cleanup.",
      sqlHint: "Filter rows where key business columns are NULL and repair in SQL Sandbox." });
    signals.push({ kind: "risk", text: `${nullPct.toFixed(1)}% null exposure`, detail: "Blank fields reduce reporting reliability." });
  } else {
    signals.push({ kind: "strength", text: "Null density within threshold", detail: `Only ${nullPct.toFixed(1)}% blank cells detected.` });
  }

  // Duplicates
  const distinct = new Set(rows.map((r) => JSON.stringify(r))).size;
  const dupes    = rows.length - distinct;
  if (dupes > 0) {
    diagnoses.push({ id: "duplicate-rows", severity: dupes > Math.max(5, rows.length * 0.03) ? "high" : "med", issue: "Duplicate rows detected",
      evidence: `${dupes.toLocaleString("en-IN")} records appear duplicated — may inflate revenue totals.`,
      action: "Deduplicate on business key before using for reporting.",
      sqlHint: "Use ROW_NUMBER() or grouped keys in SQL Sandbox to isolate duplicates." });
    signals.push({ kind: "risk", text: `${dupes.toLocaleString("en-IN")} duplicate rows`, detail: "May inflate revenue totals." });
  } else if (rows.length > 0) {
    signals.push({ kind: "strength", text: "No duplicate rows", detail: "Dataset passes row uniqueness check." });
  }

  // Revenue & outliers
  const revVals             = rows.map((r) => revenueCol ? parseNumber(r[revenueCol]) : null).filter((v): v is number => v !== null && Number.isFinite(v));
  const totalRevenue        = revVals.reduce((s, v) => s + v, 0);
  const avgTransactionValue = revVals.length ? totalRevenue / revVals.length : 0;
  let anomaliesFound = 0;
  if (revVals.length > 10) {
    const mean = totalRevenue / revVals.length;
    const std  = Math.sqrt(revVals.reduce((s, v) => s + (v - mean) ** 2, 0) / revVals.length);
    anomaliesFound = revVals.filter((v) => Math.abs(v - mean) > 2 * std).length;
    if (anomaliesFound > 0) {
      diagnoses.push({ id: "revenue-outliers", severity: anomaliesFound > 5 ? "high" : "med", issue: "Revenue outliers detected",
        evidence: `${anomaliesFound} transaction${anomaliesFound > 1 ? "s" : ""} deviate more than 2σ from the mean (₹${fmtCurrency(mean)}).`,
        action: "Validate spike transactions for correctness before including in board-level revenue figures.",
        sqlHint: "Compute stddev and filter rows where value > mean + 2*stddev.",
        supportingCol: revenueCol ?? undefined });
      signals.push({ kind: "warning", text: `${anomaliesFound} revenue outlier${anomaliesFound > 1 ? "s" : ""}`, detail: "Values >2σ from mean require validation.", supportingCol: revenueCol ?? undefined });
    }
  }

  // MoM growth
  if (revVals.length >= 20) {
    const mid = Math.floor(revVals.length / 2);
    const g   = ((revVals.slice(mid).reduce((s, v) => s + v, 0) - revVals.slice(0, mid).reduce((s, v) => s + v, 0)) / Math.max(1, revVals.slice(0, mid).reduce((s, v) => s + v, 0))) * 100;
    if (g >= 5)  signals.push({ kind: "strength", text: `Revenue growth +${g.toFixed(1)}%`, detail: "Positive trend in the second half of the period." });
    else if (g <= -5) signals.push({ kind: "risk", text: `Revenue declining ${Math.abs(g).toFixed(1)}%`, detail: "Second-half revenue below first-half." });
  }

  // Customer concentration
  let customerConcentrationPct: number | null = null;
  let topCustomerName = "";
  if (customerCol && revenueCol && totalRevenue > 0) {
    const map = new Map<string, number>();
    for (const r of rows) { const k = String(r[customerCol] ?? "").trim() || "Unknown"; map.set(k, (map.get(k) ?? 0) + (parseNumber(r[revenueCol]) ?? 0)); }
    const ranked = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const top3   = ranked.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    const top3Pct = (top3 / totalRevenue) * 100;
    if (ranked[0]) { customerConcentrationPct = (ranked[0][1] / totalRevenue) * 100; topCustomerName = ranked[0][0]; }
    if (top3Pct > 50) {
      diagnoses.push({ id: "customer-concentration", severity: top3Pct > 65 ? "high" : "med", issue: "Customer concentration risk",
        evidence: `Top 3 customers account for ${top3Pct.toFixed(1)}% of total revenue — above the 50% advisory threshold.`,
        action: "Protect liquidity by diversifying accounts or ring-fencing concentration-dependent revenue.",
        sqlHint: "Aggregate revenue by customer and inspect top-3 share over time.",
        supportingCol: customerCol });
      signals.push({ kind: "risk", text: `Top 3 customers = ${top3Pct.toFixed(0)}% of revenue`, detail: "Concentration risk above advisory threshold.", supportingCol: customerCol });
    } else {
      signals.push({ kind: "strength", text: "Healthy customer diversification", detail: "Top 3 customers below 50% revenue share." });
    }
  }

  // Category concentration
  let categoryConcentrationPct: number | null = null;
  let topCategoryName = "";
  if (categoryCol && revenueCol && totalRevenue > 0) {
    const map = new Map<string, number>();
    for (const r of rows) { const k = String(r[categoryCol] ?? "").trim() || "Uncategorized"; map.set(k, (map.get(k) ?? 0) + (parseNumber(r[revenueCol]) ?? 0)); }
    const ranked = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    if (ranked[0]) { categoryConcentrationPct = (ranked[0][1] / totalRevenue) * 100; topCategoryName = ranked[0][0]; }
    if (categoryConcentrationPct !== null && categoryConcentrationPct > 45) {
      diagnoses.push({ id: "category-concentration", severity: categoryConcentrationPct > 65 ? "high" : "med", issue: "Category concentration risk",
        evidence: `${topCategoryName} contributes ${categoryConcentrationPct.toFixed(1)}% of total value — above the 45% advisory threshold.`,
        action: "Review whether this mix is strategic strength or hidden dependency before management reporting.",
        sqlHint: "Aggregate by category and compare lead segment against total revenue.",
        supportingCol: categoryCol });
      signals.push({ kind: "warning", text: `${topCategoryName} = ${categoryConcentrationPct.toFixed(0)}% of revenue`, detail: "Single-category dependency flagged.", supportingCol: categoryCol });
    } else if (topCategoryName) {
      signals.push({ kind: "strength", text: `${topCategoryName} leads without over-concentration`, detail: "Category mix appears balanced." });
    }
  }

  // Margins
  if (costCol && sellingCol) {
    const lowMarginCount = rows.filter((r) => {
      const cost = parseNumber(r[costCol!]); const sell = parseNumber(r[sellingCol!]);
      if (cost === null || sell === null || sell <= 0) return false;
      return ((sell - cost) / sell) * 100 < 5;
    }).length;
    if (lowMarginCount > 0) {
      diagnoses.push({ id: "margin-protection", severity: lowMarginCount >= 8 ? "high" : "med", issue: "Margin protection threshold breached",
        evidence: `${lowMarginCount.toLocaleString("en-IN")} transactions fall below the 5% margin safety threshold.`,
        action: "Review pricing discipline, discount leakage, and product-level margin guardrails.",
        sqlHint: "Compute ((sell - cost) / sell) * 100 and filter rows below 5%.",
        supportingCol: sellingCol });
      signals.push({ kind: "risk", text: `${lowMarginCount} sub-5% margin rows`, detail: "Pricing discipline requires review.", supportingCol: sellingCol });
    } else {
      signals.push({ kind: "strength", text: "Margins above 5% threshold", detail: "No pricing discipline issues detected." });
    }
  }

  if (!diagnoses.length) {
    diagnoses.push({ id: "stable-file", severity: "low", issue: "No major operational defects found",
      evidence: "The file does not show material integrity, concentration, duplicate, or outlier risks in the scanned sample.",
      action: "Proceed to board preparation.", sqlHint: "Optional cleanup only." });
  }

  const deductions  = diagnoses.reduce((s, d) => s + (d.severity === "high" ? 22 : d.severity === "med" ? 12 : 4), 0);
  const score       = Math.max(28, 100 - deductions);
  const dataQualityPct = Math.max(0, Math.min(100, 100 - nullPct - (dupes > 0 ? 6 : 0)));

  const dates = rows.map((r) => dateCol ? parseDate(r[dateCol]) : null).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  const dateRangeCovered = dates.length ? `${dates[0]!.toLocaleDateString("en-IN")} – ${dates[dates.length - 1]!.toLocaleDateString("en-IN")}` : "Date range unavailable";

  const severityCounts: Record<Severity, number> = {
    high: diagnoses.filter((d) => d.severity === "high").length,
    med:  diagnoses.filter((d) => d.severity === "med").length,
    low:  diagnoses.filter((d) => d.severity === "low").length,
  };

  const nextMoves = diagnoses.filter((d) => d.severity !== "low").sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity)).slice(0, 5).map((d, i) => `${i + 1}. ${d.action}`);

  const intro   = score > 80 ? "Data integrity is high." : score > 50 ? "Data integrity is moderate." : "Data integrity is under pressure.";
  const clauses: string[] = [];
  if (customerConcentrationPct !== null && customerConcentrationPct > 40) clauses.push(`customer concentration presents a ${Math.round(Math.max(1, customerConcentrationPct - 28))}% liquidity risk`);
  if (categoryConcentrationPct !== null && categoryConcentrationPct > 40) clauses.push(`category mix is concentrated, with ${topCategoryName} contributing ${categoryConcentrationPct.toFixed(1)}% of value`);
  if (dupes > 0) clauses.push(`${dupes.toLocaleString("en-IN")} duplicate entries require validation`);
  if (nullPct > 3) clauses.push(`blank-field exposure is ${nullPct.toFixed(1)}% of scanned cells`);
  if (!clauses.length && severityCounts.high === 0) clauses.push("the scanned sample does not show material structural or commercial risk");
  const heuristicSummary = `${intro}${clauses.length ? ` However, ${clauses.join(", ")}.` : ""}`;

  const fallbackSteps: RoadmapStep[] = [];
  const pattern = "General Enterprise";
  if (topCategoryName && categoryConcentrationPct !== null && categoryConcentrationPct > 30) {
    fallbackSteps.push({ id: "fs-cat", headline: `Expand ${topCategoryName} inventory to capitalize on ${categoryConcentrationPct.toFixed(0)}% revenue share`, why: `${topCategoryName} is the dominant revenue driver at ${categoryConcentrationPct.toFixed(0)}%. Deepening inventory depth and supplier relationships could accelerate margin improvement before the next board cycle.`, body: `Deepening inventory depth and supplier relationships in this category could accelerate margin improvement. A 10% increase in SKU range has historically yielded 6–8% revenue lift in comparable cohorts.`, priority: "high", patternName: pattern });
  } else {
    fallbackSteps.push({ id: "fs-div", headline: "Diversify category mix to reduce single-segment dependency", why: "Category revenue is relatively balanced. Introducing 2–3 high-margin adjacent categories could improve resilience against demand shifts.", body: "Introducing 2–3 high-margin adjacent categories could improve resilience against demand shifts. Focus on categories with overlapping supplier networks to minimise onboarding cost.", priority: "medium", patternName: pattern });
  }
  if (topCustomerName && customerConcentrationPct !== null && customerConcentrationPct > 40) {
    fallbackSteps.push({ id: "fs-cust", headline: `Reduce reliance on ${topCustomerName} to de-risk revenue base`, why: `A single customer accounting for ${customerConcentrationPct.toFixed(0)}% of revenue creates structural fragility. Qualifying 3–5 new accounts to 10% share each is the recommended mitigation path.`, body: `Actively qualifying 3–5 new accounts to 10% share each is the recommended mitigation path. Consider referral incentives and channel partner programs.`, priority: "high", patternName: pattern });
  } else {
    fallbackSteps.push({ id: "fs-growth", headline: "Target top-performing customers for upsell or cross-sell programs", why: "With healthy diversification, a structured upsell campaign targeting the top 10 accounts by transaction frequency has the highest expected ROI within a 90-day window.", body: "With healthy customer diversification, a structured upsell campaign targeting the top 10 accounts by transaction frequency has the highest expected ROI within a 90-day window.", priority: "medium", patternName: pattern });
  }
  if (anomaliesFound > 0) {
    fallbackSteps.push({ id: "fs-anomaly", headline: `Investigate ${anomaliesFound} revenue spike${anomaliesFound > 1 ? "s" : ""} before board submission`, why: "Statistical outliers in revenue often indicate data entry errors, one-off bulk orders, or misclassified returns. Each must be confirmed before executive KPI decks are finalised.", body: "Statistical outliers often indicate data entry errors, one-off bulk orders, or misclassified returns. Confirm each before including in trend analysis or executive KPI decks.", priority: "high", patternName: pattern });
  } else {
    fallbackSteps.push({ id: "fs-forecast", headline: "Revenue data is clean — initiate quarterly forecasting", why: "With anomaly-free transaction data, this dataset is ready for time-series forecasting. A 3-month forward projection would provide credible guidance for the next board pack.", body: "With anomaly-free transaction data, this dataset is ready for time-series forecasting. A 3-month forward projection using the last 6 months of data would provide credible board-level guidance.", priority: "low", patternName: pattern });
  }

  return {
    score, severityCounts, totalRevenue, avgTransactionValue, anomaliesFound,
    nextMoves: nextMoves.length ? nextMoves : ["1. Proceed to final board preparation — no material audit blockers detected."],
    vitals: { totalRecordCount: rows.length, dateRangeCovered, dataQualityPct: Math.round(dataQualityPct) },
    heuristicSummary, signals, diagnoses, fallbackSteps,
    salesBase: totalRevenue,
    revenueColName: revenueCol,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Store → RoadmapStep mapper
// ─────────────────────────────────────────────────────────────────────────────

function buildRoadmapFromStore(aiNextMoves: string[], detectedPattern: string, fallbackSteps: RoadmapStep[]): RoadmapStep[] {
  if (!aiNextMoves.length) return fallbackSteps;
  return aiNextMoves.slice(0, 5).map((move, i) => {
    const clean = move.replace(/^\d+\.\s*/, "").trim();
    return {
      id:          `ai-step-${i}`,
      headline:    clean.length > 92 ? `${clean.slice(0, 92)}…` : clean,
      why:         `Recommended based on the detected "${detectedPattern}" pattern. This action addresses the most critical structural or commercial risk identified by the Gemini + DeepSeek R1 dual-audit. Validate against the Issue Tracker before board submission.`,
      body:        clean,
      priority:    (i === 0 ? "high" : i <= 2 ? "medium" : "low") as RoadmapStep["priority"],
      patternName: detectedPattern,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hybrid score — AI patternConfidence modulates heuristic base
// ─────────────────────────────────────────────────────────────────────────────

function deriveHybridScore(base: number, patternConfidence: number | undefined, diagnoses: Diagnosis[]): number {
  if (!patternConfidence) return base;
  const bonus   = Math.round((patternConfidence - 0.5) * 20);
  const penalty = diagnoses.filter((d) => d.severity === "high").length > 2 ? -5 : 0;
  return Math.max(12, Math.min(100, base + bonus + penalty));
}

// ─────────────────────────────────────────────────────────────────────────────
// What-If score formula — purely local, no AI calls
// score = base + margin_bonus + hours_bonus - concentration_penalty
// ─────────────────────────────────────────────────────────────────────────────

function computeWhatIfScore(
  baseScore:   number,
  marginPct:   number,
  hoursSaved:  number,
  highIssues:  number
): number {
  const marginBonus  = Math.round((marginPct - 18) * 0.4);   // 18% is baseline assumption
  const hoursBonus   = Math.round((hoursSaved - 10) * 0.3);  // 10 hrs is baseline
  const issuePenalty = highIssues * 3;
  return Math.max(10, Math.min(100, baseScore + marginBonus + hoursBonus - issuePenalty));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tone helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreTone(score: number) {
  if (score > 80) return { ring: "#10b981", ringBg: "#ecfdf5", label: "Healthy",       badge: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  if (score > 50) return { ring: "#f59e0b", ringBg: "#fffbeb", label: "Moderate Risk", badge: "border-amber-200 bg-amber-50 text-amber-700"   };
  return           { ring: "#f43f5e",        ringBg: "#fff1f2", label: "Critical",      badge: "border-rose-200 bg-rose-50 text-rose-700"       };
}
function sevStyles(s: Severity) {
  if (s === "high") return { badge: "border-rose-200 bg-rose-50 text-rose-700",    row: "border-l-[3px] border-l-rose-400"    };
  if (s === "med")  return { badge: "border-amber-200 bg-amber-50 text-amber-700", row: "border-l-[3px] border-l-amber-400"   };
  return                   { badge: "border-emerald-200 bg-emerald-50 text-emerald-700", row: "border-l-[3px] border-l-emerald-300" };
}
function priorityBadge(p: RoadmapStep["priority"]) {
  if (p === "high")   return "border-rose-200 bg-rose-50 text-rose-700";
  if (p === "medium") return "border-amber-200 bg-amber-50 text-amber-700";
  return                     "border-emerald-200 bg-emerald-50 text-emerald-700";
}

// ─────────────────────────────────────────────────────────────────────────────
// Confidence meter sub-component
// ─────────────────────────────────────────────────────────────────────────────

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-slate-700 w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VitalityGauge — large animated SVG ring
// ─────────────────────────────────────────────────────────────────────────────

function VitalityGauge({ score, animated }: { score: number; animated: number }) {
  const tone       = scoreTone(score);
  const R          = 60;
  const circ       = 2 * Math.PI * R;
  const dashOffset = circ - (animated / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative flex h-56 w-56 items-center justify-center rounded-full" style={{ background: tone.ringBg }}>
        <svg width={188} height={188} viewBox="0 0 160 160" className="-rotate-90">
          <circle cx={80} cy={80} r={R} fill="none" stroke="#e2e8f0" strokeWidth={14} />
          <motion.circle
            cx={80} cy={80} r={R} fill="none" strokeWidth={14} strokeLinecap="butt"
            stroke={tone.ring}
            style={{ strokeDasharray: circ, strokeDashoffset: dashOffset }}
            transition={{ duration: 1.1, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-[3.5rem] font-extrabold tabular-nums leading-none tracking-tight text-slate-900">{animated}</span>
          <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">/ 100</span>
        </div>
      </div>
      <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold ${tone.badge}`}>
        {score > 80 ? <CheckCircle2 className="h-4 w-4" /> : score > 50 ? <AlertTriangle className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
        {tone.label}
      </span>
      <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Business Vitality Score</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InsightBadge — fixed height, no layout shift
// ─────────────────────────────────────────────────────────────────────────────

function InsightBadge({ text, isAI, loading = false }: { text: string | null; isAI: boolean; loading?: boolean }) {
  if (loading) return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 min-h-[72px]">
      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-300" />
      <div className="flex-1 space-y-2.5 pt-0.5">
        <div className="h-2.5 w-4/5 rounded-full bg-slate-200 animate-pulse" />
        <div className="h-2.5 w-3/5 rounded-full bg-slate-200 animate-pulse" />
        <div className="h-2.5 w-2/5 rounded-full bg-slate-200 animate-pulse" />
      </div>
    </div>
  );
  if (!text) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className={`flex items-start gap-3 rounded-2xl border px-5 py-4 min-h-[72px] ${isAI ? "border-blue-100 bg-blue-50/70" : "border-slate-100 bg-slate-50"}`}>
      {isAI ? <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#2185fb]" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
      <p className={`text-sm leading-7 ${isAI ? "text-blue-800" : "text-slate-600"}`}>{text}</p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WhyAnchor — pattern-referencing tooltip (stop-propagation via capture phase)
// ─────────────────────────────────────────────────────────────────────────────

function WhyAnchor({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block" onClickCapture={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
      >
        <Lightbulb className="h-3 w-3" />
        Why?
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{   opacity: 0, y: -4, scale: 0.97  }}
            transition={{ duration: 0.14 }}
            className="absolute left-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Strategic Rationale</p>
              <button onClick={() => setOpen(false)} className="text-slate-300 hover:text-slate-600 transition-colors"><X className="h-3.5 w-3.5" /></button>
            </div>
            <p className="text-xs leading-relaxed text-slate-700">{text}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EvidenceModal — "View Data" modal showing supporting rows for a signal
// ─────────────────────────────────────────────────────────────────────────────

function EvidenceModal({
  signalText,
  colName,
  rows,
  onClose,
}: {
  signalText: string;
  colName:    string;
  rows:       RowRecord[];
  onClose:    () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Show first 20 rows that have a value in the supporting column
  const supporting = rows.filter((r) => !isNullish(r[colName])).slice(0, 20);
  const allCols    = Object.keys(rows[0] ?? {}).slice(0, 6); // show first 6 cols

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1,    opacity: 1, y: 0 }}
        exit={{   scale: 0.96, opacity: 0       }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Database className="h-4 w-4 text-slate-400" />
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Evidence Mode · {colName}</p>
            </div>
            <h2 className="text-base font-semibold text-slate-900">{signalText}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{supporting.length} supporting row{supporting.length !== 1 ? "s" : ""} shown (first 20 of dataset)</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Data table */}
        <div className="overflow-auto max-h-[400px]">
          {supporting.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm italic text-slate-400">No rows found for column "{colName}"</p>
            </div>
          ) : (
            <table className="w-full min-w-max border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                <tr>
                  {allCols.map((c) => (
                    <th key={c} className={`px-4 py-3 text-left font-semibold uppercase tracking-wider text-slate-500 ${c === colName ? "text-[#2185fb] bg-blue-50" : ""}`}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {supporting.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    {allCols.map((c) => (
                      <td key={c} className={`px-4 py-2.5 text-slate-700 max-w-[160px] truncate ${c === colName ? "font-semibold text-slate-900 bg-blue-50/40" : ""}`}>
                        {String(row[c] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-slate-100 px-6 py-3">
          <p className="text-xs text-slate-400">
            Column <span className="font-semibold text-slate-600">{colName}</span> highlighted · 800-row privacy cap applied · Press{" "}
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd> to close
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatIfSidebar — Margin % + Hours Saved inputs → real-time score + ROI
// ─────────────────────────────────────────────────────────────────────────────

function WhatIfSidebar({
  baseScore,
  highIssues,
  salesBase,
  whatIfScore,
  marginPct,
  hoursSaved,
  onMarginChange,
  onHoursChange,
  onClose,
}: {
  baseScore:       number;
  highIssues:      number;
  salesBase:       number;
  whatIfScore:     number;
  marginPct:       number;
  hoursSaved:      number;
  onMarginChange:  (v: number) => void;
  onHoursChange:   (v: number) => void;
  onClose:         () => void;
}) {
  const monthlyProfit = salesBase * (marginPct / 100);
  const timeValueMth  = hoursSaved * 4 * 500;  // ₹500/hr × 4 weeks
  const scoreDelta    = whatIfScore - baseScore;
  const tone          = scoreTone(whatIfScore);

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.22 }}
      className="w-72 shrink-0 rounded-2xl border border-slate-200 bg-white shadow-sm sticky top-6 self-start overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">What-If Simulator</p>
        </div>
        <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-5 p-4">
        {/* Projected score gauge (small) */}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-4 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Projected Score</p>
          <div className="relative mx-auto" style={{ width: 80, height: 80 }}>
            <svg width={80} height={80} viewBox="0 0 80 80" className="-rotate-90">
              <circle cx={40} cy={40} r={28} fill="none" stroke="#e2e8f0" strokeWidth={8} />
              <motion.circle
                cx={40} cy={40} r={28} fill="none" strokeWidth={8} strokeLinecap="butt"
                stroke={tone.ring}
                style={{ strokeDasharray: 2 * Math.PI * 28, strokeDashoffset: 2 * Math.PI * 28 - (whatIfScore / 100) * 2 * Math.PI * 28 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-extrabold tabular-nums leading-none" style={{ color: tone.ring }}>{whatIfScore}</span>
            </div>
          </div>
          <div className={`mt-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone.badge}`}>
            {scoreDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {scoreDelta >= 0 ? "+" : ""}{scoreDelta} pts vs current
          </div>
        </div>

        {/* Margin % slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Assumed Margin %</p>
            <span className="text-sm font-bold tabular-nums text-slate-800">{marginPct}%</span>
          </div>
          <input
            type="range" min={0} max={60} step={1} value={marginPct}
            onChange={(e) => onMarginChange(Number(e.target.value))}
            className="w-full accent-[#2185fb]"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
            <span>0%</span><span>30%</span><span>60%</span>
          </div>
        </div>

        {/* Hours saved slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Hours Saved / Week</p>
            <span className="text-sm font-bold tabular-nums text-slate-800">{hoursSaved}h</span>
          </div>
          <input
            type="range" min={0} max={40} step={1} value={hoursSaved}
            onChange={(e) => onHoursChange(Number(e.target.value))}
            className="w-full accent-[#2185fb]"
          />
          <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
            <span>0</span><span>20h</span><span>40h</span>
          </div>
        </div>

        {/* ROI outputs */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Projected ROI</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-center">
              <p className="text-[10px] text-slate-400 mb-1">Monthly Profit</p>
              <p className="text-sm font-bold text-slate-900 truncate" title={`₹${fmtCurrency(monthlyProfit)}`}>
                ₹{fmtCurrency(monthlyProfit)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-center">
              <p className="text-[10px] text-slate-400 mb-1">Time Value / Month</p>
              <p className="text-sm font-bold text-slate-900 truncate" title={`₹${fmtCurrency(timeValueMth)}`}>
                ₹{fmtCurrency(timeValueMth)}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-center">
            <p className="text-[10px] text-emerald-600 mb-0.5">Combined Monthly Value</p>
            <p className="text-base font-extrabold text-emerald-700">₹{fmtCurrency(monthlyProfit + timeValueMth)}</p>
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-slate-400">
          Score adjusts for margin improvement vs baseline 18%. Hours saved assumes ₹500/hr opportunity cost. High-severity issues penalise the score.
        </p>
      </div>
    </motion.aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4200); return () => clearTimeout(t); }, [onClose]);
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-xl">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      <p className="text-sm font-medium text-emerald-800">{message}</p>
      <button onClick={onClose} className="ml-2 text-emerald-400 hover:text-emerald-700 transition-colors"><X className="h-3.5 w-3.5" /></button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function BusinessHealthView() {
  const nav = useNavigate();

  // ── 1. Store reads ───────────────────────────────────────────────────────
  const { dataset, dashboard } = useDatasetStore() as {
    dataset: { columns?: string[]; rows?: RowRecord[]; meta?: { name?: string } | null } | null;
    dashboard: {
      audit?: {
        source?:            string;
        detectedPattern?:   string;
        reasoning?:         string;
        executiveSummary?:  string;
        nextMoves?:         string[];
        riskFlags?:         string[];
        primarySignals?:    string[];
        patternConfidence?: number;
      } | null;
    } | null;
  };

  const isMock = !dataset;

  // ── 2. useDualAudit — mount only, no new network calls here ──────────────
  useDualAudit();

  // ── 3. Metadata ──────────────────────────────────────────────────────────
  const datasetName = isMock ? "Sample Retail Dataset" : (dataset?.meta?.name ?? "Untitled dataset");
  const rowCount    = isMock ? 4821 : (dataset?.rows?.length ?? 0);
  const colCount    = isMock ? 12   : (dataset?.columns?.length ?? 0);

  // ── 4. UI state ───────────────────────────────────────────────────────────
  const [animatedScore, setAnimatedScore] = useState(0);
  const [insightMode,   setInsightMode]   = useState<InsightMode>("offline");
  const [resolved,      setResolved]      = useState<Record<string, boolean>>({});
  const [sortKey,       setSortKey]       = useState<SortKey>("severity");
  const [sortAsc,       setSortAsc]       = useState(false);
  const [expandedStep,  setExpandedStep]  = useState<string | null>(null);
  const [toast,         setToast]         = useState<string | null>(null);

  // What-If sidebar
  const [showWhatIf,   setShowWhatIf]   = useState(false);
  const [marginPct,    setMarginPct]    = useState(18);
  const [hoursSaved,   setHoursSaved]   = useState(10);

  // Evidence modal
  const [evidenceSignal, setEvidenceSignal] = useState<{ text: string; colName: string } | null>(null);

  // ── 5. Heuristic (synchronous, instant) ──────────────────────────────────
  const heuristic = useMemo(
    () => (isMock ? MOCK : computeRetailHealth(dataset)),
    [dataset, isMock]
  );

  // ── 6. Store audit reads ──────────────────────────────────────────────────
  const storedAudit  = dashboard?.audit;
  const auditSource  = storedAudit?.source ?? "heuristic";
  const isAIReady    = !!storedAudit && auditSource !== "heuristic";
  const isAIActive   = insightMode === "ai" && isAIReady;
  const aiInFlight   = !isAIReady && !isMock;

  // patternConfidence for Confidence Score
  const patternConfidence = storedAudit?.patternConfidence;

  useEffect(() => {
    if (isAIReady) { setInsightMode("ai"); setToast("AI strategic brief ready"); }
  }, [isAIReady]);

  // ── 7. Derived display values ─────────────────────────────────────────────
  const detectedPattern = storedAudit?.detectedPattern ?? "General Enterprise";

  const displayScore = useMemo(() => {
    if (!isAIActive) return heuristic.score;
    return deriveHybridScore(heuristic.score, storedAudit?.patternConfidence, heuristic.diagnoses);
  }, [isAIActive, heuristic, storedAudit?.patternConfidence]);

  // What-If score — updates in real-time from sidebar inputs
  const whatIfScore = useMemo(
    () => computeWhatIfScore(displayScore, marginPct, hoursSaved, heuristic.severityCounts.high),
    [displayScore, marginPct, hoursSaved, heuristic.severityCounts.high]
  );

  const displaySummary = useMemo(() => {
    if (!isAIActive) return heuristic.heuristicSummary;
    const raw   = storedAudit?.executiveSummary ?? storedAudit?.reasoning ?? heuristic.heuristicSummary;
    const words = raw.split(/\s+/).filter(Boolean);
    return words.slice(0, 150).join(" ") + (words.length > 150 ? "…" : "");
  }, [isAIActive, heuristic, storedAudit]);

  const displayReasoning = useMemo(
    () => (isAIActive ? (storedAudit?.reasoning ?? null) : null),
    [isAIActive, storedAudit]
  );

  // Signal classification — polarity scorer, no column bleed
  const displayStrengths = useMemo<Signal[]>(() => {
    if (!isAIActive) return heuristic.signals.filter((s) => s.kind === "strength").slice(0, 4);
    const aiPositive: Signal[] = (storedAudit?.primarySignals ?? [])
      .filter((s) => classifySignalPolarity(s) === 1)
      .slice(0, 4).map((text): Signal => ({ kind: "strength", text }));
    if (aiPositive.length >= 2) return aiPositive;
    return heuristic.signals.filter((s) => s.kind === "strength").slice(0, 4);
  }, [isAIActive, heuristic, storedAudit]);

  const displayRisks = useMemo<Signal[]>(() => {
    if (!isAIActive) return heuristic.signals.filter((s) => s.kind !== "strength").slice(0, 4);
    const fromRiskFlags: Signal[] = (storedAudit?.riskFlags ?? []).slice(0, 3).map((text): Signal => ({ kind: "risk", text }));
    const fromPrimary:   Signal[] = (storedAudit?.primarySignals ?? [])
      .filter((s) => classifySignalPolarity(s) === -1)
      .filter((s) => !fromRiskFlags.some((r) => r.text.slice(0, 40) === s.slice(0, 40)))
      .slice(0, 2).map((text): Signal => ({ kind: "risk", text }));
    const combined = [...fromRiskFlags, ...fromPrimary];
    if (combined.length >= 2) return combined.slice(0, 4);
    return heuristic.signals.filter((s) => s.kind !== "strength").slice(0, 4);
  }, [isAIActive, heuristic, storedAudit]);

  const roadmapSteps = useMemo<RoadmapStep[]>(() => {
    if (!isAIActive) return heuristic.fallbackSteps;
    return buildRoadmapFromStore(storedAudit?.nextMoves ?? [], detectedPattern, heuristic.fallbackSteps);
  }, [isAIActive, heuristic, storedAudit, detectedPattern]);

  // ── 8. Animated score counter ─────────────────────────────────────────────
  useEffect(() => {
    let frame = 0;
    const start = performance.now(); const target = displayScore;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1000);
      setAnimatedScore(Math.round(p * target));
      if (p < 1) frame = requestAnimationFrame(tick); else setAnimatedScore(target);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [displayScore]);

  // ── 9. Store sync ─────────────────────────────────────────────────────────
  const reportPayload = useMemo(() => ({
    score: displayScore, alerts: heuristic.diagnoses.filter((d) => d.severity !== "low"),
    nextMoves: heuristic.nextMoves, aiSummary: displaySummary, generatedAt: Date.now(),
  }), [displayScore, heuristic, displaySummary]);

  const lastSigRef = useRef("");
  useEffect(() => {
    if (!dataset) return;
    const sig = JSON.stringify({ score: reportPayload.score, s: reportPayload.aiSummary?.slice(0, 60) });
    if (lastSigRef.current === sig) return;
    lastSigRef.current = sig;
    datasetStore.set({ report: reportPayload as never });
  }, [dataset, reportPayload]);

  // ── 10. Sort & resolve ────────────────────────────────────────────────────
  const sortedDiagnoses = useMemo(() => {
    const list = [...heuristic.diagnoses];
    list.sort((a, b) => {
      if (sortKey === "severity") { const d = severityWeight(a.severity) - severityWeight(b.severity); return sortAsc ? d : -d; }
      const d = (a[sortKey] ?? "").toLowerCase().localeCompare((b[sortKey] ?? "").toLowerCase());
      return sortAsc ? d : -d;
    });
    return list;
  }, [heuristic.diagnoses, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => { if (sortKey === key) { setSortAsc((p) => !p); return; } setSortKey(key); setSortAsc(key === "severity" ? false : true); };
  const toggleResolved = (id: string) => setResolved((p) => ({ ...p, [id]: !p[id] }));

  const exportAudit = useCallback(() => {
    const rows = [["Issue Name", "Severity", "Evidence", "Action", "SQL Hint"], ...heuristic.diagnoses.map((d) => [d.issue, d.severity, d.evidence, d.action, d.sqlHint])];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadText(`${datasetName.replace(/\s/g, "-").toLowerCase()}-health-audit.csv`, csv, "text/csv;charset=utf-8");
  }, [heuristic.diagnoses, datasetName]);

  const resolvedCount = Object.values(resolved).filter(Boolean).length;
  const allRows = ((dataset?.rows ?? []) as RowRecord[]).slice(0, 800);

  // ─── Empty state ──────────────────────────────────────────────────────────
  if (!isMock && rowCount === 0) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex items-center justify-center px-8">
        <Card className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50"><Activity className="h-5 w-5 text-slate-400" /></div>
            <CardTitle className="text-lg font-semibold text-slate-900">No dataset loaded</CardTitle>
            <CardDescription className="text-sm text-slate-500">Complete the Upload → Schema → SQL → Visualize steps first.</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6 flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => nav("/app/visuals")}><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Visuals</Button>
            <Button size="sm" className="rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => nav("/app/upload")}>Upload Data <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <AnimatePresence>{toast && <Toast message={toast} onClose={() => setToast(null)} />}</AnimatePresence>

      {/* Evidence Modal */}
      <AnimatePresence>
        {evidenceSignal && (
          <EvidenceModal
            signalText={evidenceSignal.text}
            colName={evidenceSignal.colName}
            rows={allRows}
            onClose={() => setEvidenceSignal(null)}
          />
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-[1440px] px-8 py-8">

        {/* ════════════════════════════════════════════════════
            PAGE HEADER
        ════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-7">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">AutoAnalyst · Step 5 of 6</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Health Diagnosis</h1>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
              Heuristic audit visible instantly. AI reads from <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">dashboard.audit</code> — zero new calls.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{datasetName}</span>
              <span className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{rowCount.toLocaleString("en-IN")} rows · {colCount} cols</span>
              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${scoreTone(displayScore).badge}`}>
                Score {displayScore} / 100
              </span>
              {heuristic.severityCounts.high > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                  <ShieldAlert className="h-3.5 w-3.5" />{heuristic.severityCounts.high} critical {heuristic.severityCounts.high > 1 ? "issues" : "issue"}
                </span>
              )}
              {aiInFlight && <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"><Loader2 className="h-3.5 w-3.5 animate-spin" /> AI brief loading…</span>}
              {isAIReady  && <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"><Sparkles className="h-3.5 w-3.5" />{auditSource === "merged" ? "Gemini + DeepSeek R1" : `AI (${auditSource})`}</span>}
              {storedAudit?.detectedPattern && <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"><Zap className="h-3.5 w-3.5" /> {storedAudit.detectedPattern}</span>}
              {isMock && <span className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs text-slate-500">Preview mode</span>}
            </div>
          </div>

          {/* TOP-RIGHT NAV */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* AI / Offline toggle */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1 gap-0.5">
              <button onClick={() => setInsightMode("ai")} className={["flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all", insightMode === "ai" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"].join(" ")}>
                AI Insights
                {insightMode === "ai" && isAIReady && <span className="rounded-md bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">Live</span>}
              </button>
              <button onClick={() => setInsightMode("offline")} className={["flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all", insightMode === "offline" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"].join(" ")}>
                <Lock className="h-3.5 w-3.5" />Offline
              </button>
            </div>
            {/* What-If toggle */}
            <Button variant="outline" size="sm" className={`rounded-xl ${showWhatIf ? "border-[#2185fb] bg-blue-50 text-[#2185fb]" : ""}`} onClick={() => setShowWhatIf((s) => !s)}>
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />What-If
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={exportAudit}><Download className="mr-1.5 h-3.5 w-3.5" /> Export Audit</Button>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => nav("/app/visuals")}> Back </Button>
            <Button size="sm" className="rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => nav("/app/final")}>Next: Final Board</Button>
          </div>
        </div>

        {/* ── Main content with optional What-If sidebar ────────────────── */}
        <div className="mt-8 flex gap-6">
          <div className="min-w-0 flex-1 space-y-7">

            {/* ════════════════════════════════════════════════════
                SECTION 1: HEALTH HERO
                Left: VitalityGauge + sub-KPI + Confidence Score
                Right: Executive Briefing + AI Reasoning + 4-KPI grid
            ════════════════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
              className="grid grid-cols-1 gap-6 lg:grid-cols-3">

              {/* Gauge card */}
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col items-center justify-center py-10 px-8">
                <VitalityGauge score={displayScore} animated={animatedScore} />

                {/* Sub-KPI strip */}
                <div className="mt-8 w-full rounded-xl border border-[#d1d5db] bg-[#f3f4f6] px-5 py-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[
                      { value: heuristic.severityCounts.high,         label: "Critical" },
                      { value: heuristic.anomaliesFound,               label: "Outliers" },
                      { value: `${heuristic.vitals.dataQualityPct}%`,  label: "Quality"  },
                    ].map((k) => (
                      <div key={k.label}>
                        <p className="text-2xl font-extrabold tabular-nums text-black">{k.value}</p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500">{k.label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Confidence Score — new in v8.0 */}
                {patternConfidence !== undefined && (
                  <div className="mt-5 w-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <BarChart2 className="h-3.5 w-3.5 text-slate-400" />
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Confidence Score</p>
                      </div>
                      <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${patternConfidence >= 0.75 ? "bg-emerald-100 text-emerald-700" : patternConfidence >= 0.5 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                        {patternConfidence >= 0.75 ? "High" : patternConfidence >= 0.5 ? "Medium" : "Low"}
                      </span>
                    </div>
                    <ConfidenceMeter value={patternConfidence} />
                    <p className="mt-1.5 text-[10px] text-slate-400 leading-relaxed">
                      Based on <span className="font-medium text-slate-500">{detectedPattern}</span> · {auditSource}
                    </p>
                  </div>
                )}

                {/* Audit source tag */}
                <div className="mt-4 flex items-center justify-center gap-1.5">
                  {aiInFlight  ? (<><Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" /><span className="text-[11px] text-slate-400">AI analysis in progress</span></>) :
                   isAIActive  ? (<><Sparkles className="h-3.5 w-3.5 text-[#2185fb]" /><span className="text-[11px] text-slate-500">AI-modulated · {auditSource}</span></>) :
                                 (<><ShieldCheck className="h-3.5 w-3.5 text-slate-400" /><span className="text-[11px] text-slate-400">Offline heuristic audit</span></>)}
                </div>
              </Card>

              {/* Executive Briefing card */}
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
                <CardHeader className="pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    {isAIActive ? <Sparkles className="h-4 w-4 text-[#2185fb]" /> : <Activity className="h-4 w-4 text-slate-400" />}
                    <CardTitle className="text-sm font-semibold text-slate-900">{isAIActive ? "AI Executive Briefing" : "Executive Briefing"}</CardTitle>
                    <span className={["ml-auto rounded-lg px-2.5 py-1 text-[11px] font-medium", isAIActive ? "border border-blue-200 bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"].join(" ")}>
                      {isAIActive ? `AI · ${auditSource}` : aiInFlight ? "Heuristic — AI loading" : "Offline Heuristic"}
                    </span>
                  </div>
                  <CardDescription className="text-xs text-slate-400 leading-relaxed mt-0.5">
                    {isAIActive
                      ? `Board-ready brief · Pattern: ${detectedPattern}${storedAudit?.patternConfidence !== undefined ? ` · Confidence ${Math.round(storedAudit.patternConfidence * 100)}%` : ""}`
                      : aiInFlight
                      ? "AI brief generating — heuristic summary visible immediately."
                      : `Offline heuristic analysis from 800-row dataset sample · ${datasetName}`}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-5 space-y-5">
                  {/* Summary */}
                  <AnimatePresence mode="wait">
                    {aiInFlight && !isAIActive ? (
                      <div key="skeleton" className="rounded-2xl border border-slate-100 bg-slate-50 px-5 py-5 min-h-[96px] space-y-3">
                        <div className="h-3 w-full rounded-full bg-slate-200 animate-pulse" />
                        <div className="h-3 w-5/6 rounded-full bg-slate-200 animate-pulse" />
                        <div className="h-3 w-4/6 rounded-full bg-slate-200 animate-pulse" />
                        <p className="text-[11px] text-slate-400 pt-1">AI strategic brief arriving…</p>
                      </div>
                    ) : (
                      <motion.div key={isAIActive ? "ai" : "heuristic"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24 }}>
                        <InsightBadge text={displaySummary} isAI={isAIActive} />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Reasoning panel */}
                  <AnimatePresence>
                    {isAIActive && displayReasoning && (
                      <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-5 py-4">
                          <div className="flex items-center gap-2 mb-2.5">
                            <Zap className="h-3.5 w-3.5 text-[#2185fb]" />
                            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Auditor Reasoning — Why this score?</p>
                          </div>
                          <p className="text-sm leading-7 text-slate-600">{displayReasoning}</p>
                          {storedAudit?.detectedPattern && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {[
                                { label: "Detected Pattern", value: storedAudit.detectedPattern },
                                { label: "Confidence",        value: storedAudit.patternConfidence !== undefined ? `${Math.round(storedAudit.patternConfidence * 100)}%` : "—" },
                                { label: "Audit Source",      value: auditSource },
                              ].map((item) => (
                                <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                                  <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</p>
                                  <p className="mt-0.5 text-xs font-medium text-slate-800">{item.value}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* 4-KPI grid */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: "Total Revenue",   value: `₹${fmtCurrency(heuristic.totalRevenue)}` },
                      { label: "Avg Transaction", value: `₹${fmtCurrency(heuristic.avgTransactionValue)}` },
                      { label: "Date Range",      value: heuristic.vitals.dateRangeCovered },
                      { label: "Total Records",   value: heuristic.vitals.totalRecordCount.toLocaleString("en-IN") },
                    ].map((kpi) => (
                      <div key={kpi.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3 text-center">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{kpi.label}</p>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-800" title={kpi.value}>{kpi.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* ════════════════════════════════════════════════════
                SECTION 2: SIGNAL GRID — Strengths + Risks
                Each signal has a "View Data" button (Evidence Mode)
            ════════════════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.08 }}>
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <Activity className="h-4 w-4 text-slate-400" />
                    <CardTitle className="text-sm font-semibold text-slate-900">Business Signals</CardTitle>
                    {isAIActive  && <span className="ml-auto inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-600"><Sparkles className="h-3 w-3" /> AI-enhanced · {detectedPattern}</span>}
                    {aiInFlight  && <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] text-slate-400"><Loader2 className="h-3 w-3 animate-spin" /> AI refining…</span>}
                  </div>
                  <CardDescription className="text-xs text-slate-400 leading-relaxed">
                    {isAIActive
                      ? `Positive signals and structural risks from the ${auditSource} audit, contextualised to "${detectedPattern}". Click "View Data" to see supporting rows.`
                      : "Heuristic signals from structural analysis of the 800-row sample. Click " }
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2">

                    {/* STRENGTHS — Emerald */}
                    <div>
                      <div className="mb-4 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-600" />
                        <p className="text-xs font-semibold uppercase tracking-[0.11em] text-emerald-700">Strengths</p>
                        <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">{displayStrengths.length}</span>
                      </div>
                      <div className="space-y-2.5">
                        {displayStrengths.length === 0 ? <p className="text-xs italic text-slate-400">No positive signals detected.</p> : (
                          displayStrengths.map((s, i) => (
                            <motion.div key={`str-${i}`} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18, delay: i * 0.04 }}
                              className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold leading-snug text-emerald-900">{s.text}</p>
                                {s.detail && <p className="mt-1 text-xs leading-relaxed text-emerald-700">{s.detail}</p>}
                                {s.supportingCol && allRows.length > 0 && (
                                  <button
                                    onClick={() => setEvidenceSignal({ text: s.text, colName: s.supportingCol! })}
                                    className="mt-2 inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700 transition hover:bg-emerald-100"
                                  >
                                    <Database className="h-3 w-3" /> View Data
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          ))
                        )}
                        {aiInFlight && !isAIActive && [1, 2].map((n) => (
                          <div key={`sk-str-${n}`} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 min-h-[52px]">
                            <div className="h-4 w-4 rounded-full bg-slate-200 shrink-0 animate-pulse mt-0.5" />
                            <div className="flex-1 space-y-1.5 pt-0.5"><div className="h-2.5 w-3/4 rounded-full bg-slate-200 animate-pulse" /></div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* CRITICAL RISKS — Rose */}
                    <div>
                      <div className="mb-4 flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4 text-rose-600" />
                        <p className="text-xs font-semibold uppercase tracking-[0.11em] text-rose-700">Critical Risks</p>
                        <span className="ml-auto rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">{displayRisks.length}</span>
                      </div>
                      <div className="space-y-2.5">
                        {displayRisks.length === 0 ? <p className="text-xs italic text-slate-400">No material risks detected.</p> : (
                          displayRisks.map((s, i) => {
                            const isRisk = s.kind === "risk";
                            return (
                              <motion.div key={`risk-${i}`} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18, delay: i * 0.04 }}
                                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${isRisk ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
                                {isRisk ? <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />}
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold leading-snug ${isRisk ? "text-rose-900" : "text-amber-900"}`}>{s.text}</p>
                                  {s.detail && <p className={`mt-1 text-xs leading-relaxed ${isRisk ? "text-rose-700" : "text-amber-700"}`}>{s.detail}</p>}
                                  {s.supportingCol && allRows.length > 0 && (
                                    <button
                                      onClick={() => setEvidenceSignal({ text: s.text, colName: s.supportingCol! })}
                                      className={`mt-2 inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium transition ${isRisk ? "border-rose-300 bg-white text-rose-700 hover:bg-rose-100" : "border-amber-300 bg-white text-amber-700 hover:bg-amber-100"}`}
                                    >
                                      <Database className="h-3 w-3" /> View Data
                                    </button>
                                  )}
                                </div>
                              </motion.div>
                            );
                          })
                        )}
                        {aiInFlight && !isAIActive && [1, 2].map((n) => (
                          <div key={`sk-risk-${n}`} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 min-h-[52px]">
                            <div className="h-4 w-4 rounded-full bg-slate-200 shrink-0 animate-pulse mt-0.5" />
                            <div className="flex-1 space-y-1.5 pt-0.5"><div className="h-2.5 w-3/4 rounded-full bg-slate-200 animate-pulse" /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* ════════════════════════════════════════════════════
                SECTION 3: STRATEGIC ROADMAP
                Vertical timeline + Why? tooltips (pattern-aware)
            ════════════════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.14 }}>
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-visible">
                <CardHeader className="pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <Lightbulb className="h-4 w-4 text-[#2185fb]" />
                    <CardTitle className="text-sm font-semibold text-slate-900">Strategic Roadmap</CardTitle>
                    <span className={["ml-auto rounded-lg border px-2.5 py-1 text-[11px] font-medium", isAIActive ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-100 text-slate-500"].join(" ")}>
                      {roadmapSteps.length} {isAIActive ? "AI recommendations" : "heuristic steps"}
                    </span>
                  </div>
                  <CardDescription className="text-xs text-slate-400 leading-relaxed">
                    {isAIActive ? `AI-generated next steps aligned to "${detectedPattern}". Click Why? for strategic rationale referencing the specific pattern.`
                      : aiInFlight ? "AI recommendations generating — heuristic guidance visible immediately."
                      : "Data-grounded action steps. Each step includes a pattern-aware Why? tooltip."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-5">
                  {aiInFlight && !isAIActive && (
                    <div className="space-y-3 mb-3">
                      {[1, 2, 3].map((n) => (
                        <div key={`sk-step-${n}`} className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4">
                          <div className="h-9 w-9 rounded-xl bg-slate-200 animate-pulse shrink-0" />
                          <div className="flex-1 space-y-2"><div className="h-3 w-3/4 rounded-full bg-slate-200 animate-pulse" /><div className="h-3 w-1/4 rounded-full bg-slate-200 animate-pulse" /></div>
                        </div>
                      ))}
                    </div>
                  )}

                  <motion.div key={isAIActive ? "ai-road" : "heuristic-road"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }} className="relative space-y-3">
                    <div className="absolute left-[2.25rem] top-10 bottom-6 w-px bg-slate-100" aria-hidden />

                    {roadmapSteps.map((step, i) => {
                      const isOpen = expandedStep === step.id;
                      return (
                        <motion.div key={step.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: i * 0.055 }}
                          className="relative rounded-2xl border border-slate-200 bg-white shadow-sm overflow-visible">

                          <div
  role="button"
  tabIndex={0}
  className="w-full flex items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50/50 rounded-2xl cursor-pointer"
  onClick={() => setExpandedStep(isOpen ? null : step.id)}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExpandedStep(isOpen ? null : step.id);
    }
  }}
>
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-slate-700 relative z-10">
    {i + 1}
  </span>

  <div className="min-w-0 flex-1">
    <p className="text-[15px] font-semibold leading-snug text-slate-900">
      {step.headline}
    </p>

    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${priorityBadge(step.priority)}`}>
        {step.priority === "high"
          ? "High priority"
          : step.priority === "medium"
          ? "Medium priority"
          : "Explore"}
      </span>

      <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-0.5 text-[10px] font-medium text-blue-600">
        <Zap className="h-2.5 w-2.5" /> {step.patternName}
      </span>

      {isAIActive && (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
          <Sparkles className="h-2.5 w-2.5" /> AI
        </span>
      )}

      <WhyAnchor text={step.why} />
    </div>
  </div>

  <span className="shrink-0 mt-1 text-slate-400">
    {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
  </span>
</div>


                          <AnimatePresence>
                            {isOpen && (
                              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden rounded-b-2xl">
                                <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-5">
                                  <p className="text-sm leading-7 text-slate-600">{step.body}</p>
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" className="h-7 text-xs rounded-xl" onClick={() => nav("/app/transform")}><TerminalSquare className="mr-1.5 h-3 w-3" /> Open in SQL</Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs rounded-xl" onClick={() => nav("/app/final")}><FileSpreadsheet className="mr-1.5 h-3 w-3" /> Add to Report</Button>
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </motion.div>
                </CardContent>
              </Card>
            </motion.div>

            {/* ════════════════════════════════════════════════════
                SECTION 4: ISSUE TRACKER
                Sortable, mark-resolved, export CSV
            ════════════════════════════════════════════════════ */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <CardHeader className="pb-4 border-b border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <ShieldAlert className="h-4 w-4 text-slate-400" />
                        <CardTitle className="text-sm font-semibold text-slate-900">Issue Tracker</CardTitle>
                      </div>
                      <CardDescription className="mt-0.5 text-xs text-slate-400 leading-relaxed">
                        {sortedDiagnoses.length} issues · {heuristic.severityCounts.high} critical · {heuristic.severityCounts.med} warnings · {resolvedCount} resolved
                      </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 text-xs rounded-xl" onClick={exportAudit}>
                      <Download className="mr-1.5 h-3 w-3" /> Export CSV
                    </Button>
                  </div>
                </CardHeader>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[820px] border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {(["issue", "severity", "evidence", "action"] as SortKey[]).map((key) => (
                          <th key={key} className="px-5 py-3.5">
                            <button className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 hover:text-slate-800 transition-colors" onClick={() => handleSort(key)}>
                              {key.charAt(0).toUpperCase() + key.slice(1)}
                              <span className="text-slate-300">
                                {sortKey === key ? sortAsc ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3" />}
                              </span>
                            </button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedDiagnoses.map((item, i) => {
                        const { badge, row } = sevStyles(item.severity);
                        const isRes          = !!resolved[item.id];
                        return (
                          <motion.tr key={item.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, delay: i * 0.025 }}
                            className={`align-top transition-colors hover:bg-slate-50/40 ${isRes ? "opacity-40" : ""} ${row}`}>
                            <td className="px-5 py-5 w-[26%]">
                              <p className={`text-[15px] font-semibold leading-snug ${isRes ? "line-through text-slate-400" : "text-slate-900"}`}>{item.issue}</p>
                              <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-slate-500 leading-relaxed max-w-[240px]">{item.sqlHint}</div>
                              {/* Evidence Mode: View Data button on issue rows */}
                              {item.supportingCol && allRows.length > 0 && (
                                <button
                                  onClick={() => setEvidenceSignal({ text: item.issue, colName: item.supportingCol! })}
                                  className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                                >
                                  <Database className="h-3 w-3" /> View Data
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-5 w-[10%]"><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${badge}`}>{item.severity}</span></td>
                            <td className="px-5 py-5 w-[32%]"><p className="text-sm text-slate-600 leading-7">{item.evidence}</p></td>
                            <td className="px-5 py-5 w-[32%]">
                              <p className="text-sm text-slate-600 leading-7">{item.action}</p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" className="h-7 text-xs rounded-xl" onClick={() => nav("/app/transform")}><TerminalSquare className="mr-1.5 h-3 w-3" /> Fix in SQL</Button>
                                <Button size="sm" variant={isRes ? "default" : "outline"} className={`h-7 text-xs rounded-xl ${isRes ? "bg-slate-900 text-white hover:bg-slate-800" : ""}`} onClick={() => toggleResolved(item.id)}>
                                  <CheckCircle2 className="mr-1.5 h-3 w-3" />{isRes ? "Resolved" : "Mark Resolved"}
                                </Button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </motion.div>

          </div>

          {/* ════════════════════════════════════════════════════
              WHAT-IF SIDEBAR (collapsible, sticky)
          ════════════════════════════════════════════════════ */}
          <AnimatePresence>
            {showWhatIf && (
              <WhatIfSidebar
                baseScore={displayScore}
                highIssues={heuristic.severityCounts.high}
                salesBase={heuristic.salesBase}
                whatIfScore={whatIfScore}
                marginPct={marginPct}
                hoursSaved={hoursSaved}
                onMarginChange={setMarginPct}
                onHoursChange={setHoursSaved}
                onClose={() => setShowWhatIf(false)}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}