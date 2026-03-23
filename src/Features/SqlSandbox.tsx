// ─────────────────────────────────────────────────────────────────────────────
// SqlSandboxView.tsx — AutoAnalyst SQL Sandbox v3.1
// Changes from v3.0:
//   1. DuckDB re-registers table on every dataset/schema change (Schema→SQL sync)
//   2. Expanded analyst-grade template pills (12 total)
//   3. handleAiGenerate uses real AI endpoint (POST /api/audit) with SQL prompt
//   4. AI Audit Active badge when dashboard.audit exists
//   All UI styles, layout, fonts, card order unchanged from v3.0.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Download,
  FileText,
  Hash,
  History,
  Loader2,
  Maximize2,
  Play,
  RotateCcw,
  Save,
  Sparkles,
  TerminalSquare,
  Type,
  Wand2,
  X,
} from "lucide-react";

import { useDuckDBQueryRunner } from "@/hooks/DuckdbQuery";
import datasetStore, { useDatasetStore, type TransformStep } from "@/lib_old/DatasetStore";
import type { Dataset, DatasetSource } from "@/lib_old/DatasetTypes";
import { applyTransformPipeline } from "@/lib_old/ApplyTransform";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import GuidedTour from "@/components/GuidedTour";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: Types & Constants — unchanged from v3.0
// ─────────────────────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";
type QueryRow = Record<string, unknown>;
type LocalTransformOp =
  | { kind: "row1Header" }
  | { kind: "trimAllText" }
  | { kind: "dropEmptyRows" }
  | { kind: "dropEmptyCols" }
  | { kind: "fillNulls"; column: string; value: string }
  | { kind: "sort"; column: string; dir: SortDir }
  | { kind: "select"; columns: string[] }
  | { kind: "delete"; columns: string[] }
  | { kind: "rename"; from: string; to: string }
  | { kind: "cast"; column: string; to: "number" | "date" | "text" }
  | { kind: "dedupe"; keyColumns: string[] };

type DqIssue = { title: string; detail: string; severity: "low" | "med" | "high" };
type ColRef = { name: string; type: string };
type HistoryEntry = { id: string; sql: string; ms: number; rowCount: number; ts: number };

const RESULTS_PAGE_SIZE = 50;
const MAX_HISTORY = 5;
const SEL_NONE = "__none";
const SEL_BLANK_COL = "__blank_col";
const SEL_PREFIX = "__col::";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: Pure Utilities — unchanged from v3.0
// ─────────────────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
function isNullish(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && !v.trim());
}
function unique(list: string[]): string[] {
  return Array.from(new Set(list));
}
function norm(s: unknown): string {
  return String(s ?? "").trim().toLowerCase();
}
function cx(...parts: Array<string | false | undefined | null>): string {
  return parts.filter(Boolean).join(" ");
}
function colLabel(col: string): string {
  const s = String(col ?? "");
  return s.trim() ? s : "(blank column)";
}
function encodeCol(col: string): string {
  const s = String(col ?? "");
  if (!s.trim()) return SEL_BLANK_COL;
  if (s === SEL_NONE || s === SEL_BLANK_COL || s.startsWith(SEL_PREFIX)) return SEL_PREFIX + encodeURIComponent("RAW:" + s);
  return SEL_PREFIX + encodeURIComponent(s);
}
function decodeCol(v: string): string {
  if (!v || v === SEL_NONE) return "";
  if (v === SEL_BLANK_COL) return "";
  if (v.startsWith(SEL_PREFIX)) {
    const raw = decodeURIComponent(v.slice(SEL_PREFIX.length));
    return raw.startsWith("RAW:") ? raw.slice(4) : raw;
  }
  return v;
}
function buildStep(label: string, op: LocalTransformOp): TransformStep {
  return { id: uid(), label, createdAt: Date.now(), op: op as never };
}
function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function toCsv(cols: string[], rows: QueryRow[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replaceAll('"', '""')}"`;
    return s;
  };
  return [cols.map(esc).join(","), ...rows.map(r => cols.map(c => esc(r?.[c])).join(","))].join("\n");
}
function severityTone(severity: DqIssue["severity"]) {
  if (severity === "high") return "bg-rose-50 text-rose-700 border-rose-200";
  if (severity === "med") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}
function inferColType(col: string, rows: QueryRow[]): string {
  const sample = rows.slice(0, 80).map(r => r[col]);
  const nonNull = sample.filter(v => !isNullish(v));
  if (!nonNull.length) return "empty";
  const n = col.toLowerCase();
  if (n.includes("date") || n.includes("time") || n.includes("month")) return "date";
  if (["amount", "total", "revenue", "sales", "debit", "credit", "balance"].some(k => n.includes(k))) return "currency";
  const numericCount = nonNull.filter(v => {
    const s = String(v).replace(/,/g, "").trim();
    return !Number.isNaN(Number(s)) && s !== "";
  }).length;
  if (numericCount / nonNull.length > 0.7) return "number";
  return "string";
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: Data Quality Engine — unchanged from v3.0
// ─────────────────────────────────────────────────────────────────────────────

function computeDQ(dataset: Dataset | null): {
  issues: DqIssue[];
  stats: { rows: number; cols: number; duplicateLikeRows: number; overallNullPct: number; columnsMostlyEmpty: number };
} {
  const cols = (dataset?.columns ?? []) as string[];
  const rows = (dataset?.rows ?? []) as QueryRow[];
  const issues: DqIssue[] = [];
  const rowCount = rows.length;
  const colCount = cols.length;
  let totalCells = 0, totalNullish = 0, columnsMostlyEmpty = 0;

  for (const c of cols) {
    let nulls = 0;
    const N = Math.min(rows.length, 3000);
    for (let i = 0; i < N; i++) { totalCells++; if (isNullish(rows[i]?.[c])) { nulls++; totalNullish++; } }
    const pct = N > 0 ? (nulls / N) * 100 : 0;
    if (pct > 60) { columnsMostlyEmpty++; issues.push({ title: `Column mostly empty: ${colLabel(c)}`, detail: `${pct.toFixed(0)}% null/blank in first ${N} rows`, severity: "med" }); }
  }

  const keyCols = cols.slice(0, Math.min(6, cols.length));
  let duplicateLikeRows = 0;
  if (keyCols.length >= 2 && rowCount > 20) {
    const seen = new Set<string>();
    const N = Math.min(rowCount, 5000);
    for (let i = 0; i < N; i++) {
      const k = keyCols.map(c => String(rows[i]?.[c] ?? "")).join("|");
      if (seen.has(k)) duplicateLikeRows++; else seen.add(k);
    }
    if (duplicateLikeRows > 0) issues.push({ title: "Possible duplicates detected", detail: `${duplicateLikeRows} duplicate-like rows in first ${Math.min(rowCount, 5000)} rows`, severity: duplicateLikeRows > 20 ? "high" : "med" });
  }

  const gstCol = cols.find(c => norm(c).includes("gstin"));
  if (gstCol) {
    const re = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/i;
    let bad = 0, total = 0;
    const N = Math.min(rowCount, 2000);
    for (let i = 0; i < N; i++) {
      const v = String(rows[i]?.[gstCol] ?? "").trim();
      if (!v) continue; total++;
      if (!re.test(v)) bad++;
    }
    if (total > 0 && bad / total > 0.2) issues.push({ title: "GSTIN format issues", detail: `${bad}/${total} non-empty GSTIN values look invalid`, severity: "high" });
  }

  const amtCols = cols.filter(c => ["amount", "total", "debit", "credit"].some(k => norm(c).includes(k)));
  for (const ac of amtCols.slice(0, 3)) {
    let mixed = 0;
    const N = Math.min(rowCount, 1000);
    for (let i = 0; i < N; i++) {
      const v = String(rows[i]?.[ac] ?? "");
      if (/[₹$]/.test(v) || /,/.test(v)) mixed++;
    }
    if (mixed / N > 0.1) issues.push({ title: `Currency format mixed: ${colLabel(ac)}`, detail: `${mixed} cells have symbol/comma — run Generic Cleanup to normalise`, severity: "low" });
  }

  const debit = cols.find(c => norm(c) === "debit" || norm(c).includes("debit"));
  const credit = cols.find(c => norm(c) === "credit" || norm(c).includes("credit"));
  const balance = cols.find(c => norm(c).includes("balance"));
  if (debit && credit && balance) issues.push({ title: "Bank statement detected", detail: "Debit/Credit/Balance present — consider Bank Cleanup playbook.", severity: "low" });

  return { issues: issues.slice(0, 12), stats: { rows: rowCount, cols: colCount, duplicateLikeRows, overallNullPct: totalCells > 0 ? (totalNullish / totalCells) * 100 : 0, columnsMostlyEmpty } };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: Heuristic SQL Generator — unchanged from v3.0 (AI path now primary)
// ─────────────────────────────────────────────────────────────────────────────

function inferAiSql(prompt: string, dataset: Dataset | null): string {
  const cols = (dataset?.columns ?? []) as string[];
  const lower = prompt.toLowerCase();
  const dateCol = cols.find(c => norm(c) === "date" || norm(c).includes("date")) ?? cols[0] ?? "date";
  const revenueCol = cols.find(c => ["revenue", "sales", "amount", "total"].some(k => norm(c).includes(k))) ?? cols[1] ?? "amount";
  const customerCol = cols.find(c => ["customer", "party", "client", "name"].some(k => norm(c).includes(k))) ?? "customer";
  const categoryCol = cols.find(c => ["category", "type", "group", "item", "product"].some(k => norm(c).includes(k))) ?? "category";

  if (lower.includes("top") && (lower.includes("customer") || lower.includes("party"))) {
    const limit = lower.match(/top\s*(\d+)/)?.[1] ?? "5";
    return `SELECT ${customerCol}, SUM(${revenueCol}) AS total_revenue\nFROM dataset\nGROUP BY ${customerCol}\nORDER BY total_revenue DESC\nLIMIT ${limit};`;
  }
  if (lower.includes("monthly") || lower.includes("month") || lower.includes("time series")) {
    return `SELECT DATE_TRUNC('month', ${dateCol}) AS month, SUM(${revenueCol}) AS total\nFROM dataset\nGROUP BY 1\nORDER BY 1;`;
  }
  if (lower.includes("category") || lower.includes("breakdown")) {
    return `SELECT ${categoryCol}, SUM(${revenueCol}) AS total\nFROM dataset\nGROUP BY 1\nORDER BY 2 DESC;`;
  }
  if (lower.includes("remove duplicates") || lower.includes("deduplicate")) {
    return `SELECT DISTINCT *\nFROM dataset;`;
  }
  if (lower.includes("missing") || lower.includes("null") || lower.includes("empty")) {
    return `SELECT *\nFROM dataset\nWHERE ${cols.slice(0, 3).map(c => `${c} IS NULL`).join(" OR ")};`;
  }
  return `SELECT *\nFROM dataset\nLIMIT 200;`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: Local Transform Executors — unchanged from v3.0
// ─────────────────────────────────────────────────────────────────────────────

function applyLocalExtra(working: Dataset, step: TransformStep): Dataset {
  const op = step.op as unknown as LocalTransformOp;
  if (op.kind === "row1Header") {
    const rows = [...(working.rows ?? [])] as QueryRow[];
    if (!rows.length) return working;
    const first = rows[0] ?? {};
    const newCols = working.columns.map((c: string, i: number) => { const v = first?.[c]; const name = String(v ?? "").trim(); return name ? name : `col${i + 1}`; });
    const outRows = rows.slice(1).map(r => { const rr: QueryRow = {}; for (let i = 0; i < working.columns.length; i++) rr[newCols[i]!] = r?.[working.columns[i]!]; return rr; });
    return { ...working, columns: newCols, rows: outRows as never, meta: { ...working.meta, rows: outRows.length, cols: newCols.length, createdAt: Date.now() } };
  }
  if (op.kind === "trimAllText") {
    const outRows = (working.rows ?? [] as QueryRow[]).map((r: QueryRow) => { const rr: QueryRow = { ...r }; for (const c of working.columns) if (typeof rr[c] === "string") rr[c] = String(rr[c]).trim(); return rr; });
    return { ...working, rows: outRows as never, meta: { ...working.meta, createdAt: Date.now() } };
  }
  if (op.kind === "dropEmptyRows") {
    const outRows = (working.rows ?? [] as QueryRow[]).filter((r: QueryRow) => working.columns.some((c: string) => !isNullish(r?.[c])));
    return { ...working, rows: outRows as never, meta: { ...working.meta, rows: outRows.length, createdAt: Date.now() } };
  }
  if (op.kind === "dropEmptyCols") {
    const wcols = working.columns ?? [];
    const wrows = (working.rows ?? []) as QueryRow[];
    const keepCols = wcols.filter((c: string) => wrows.some(r => !isNullish(r?.[c])));
    const outRows = wrows.map(r => { const rr: QueryRow = {}; for (const c of keepCols) rr[c] = r?.[c]; return rr; });
    return { ...working, columns: keepCols, rows: outRows as never, meta: { ...working.meta, cols: keepCols.length, createdAt: Date.now() } };
  }
  if (op.kind === "fillNulls") {
    if (!working.columns.includes(op.column)) return working;
    const outRows = (working.rows ?? [] as QueryRow[]).map((r: QueryRow) => isNullish(r?.[op.column]) ? { ...r, [op.column]: op.value } : r);
    return { ...working, rows: outRows as never, meta: { ...working.meta, createdAt: Date.now() } };
  }
  if (op.kind === "sort") {
    if (!working.columns.includes(op.column)) return working;
    const outRows = [...(working.rows ?? [] as QueryRow[])];
    outRows.sort((a, b) => {
      const sa = a?.[op.column] == null ? "" : String(a?.[op.column]);
      const sb = b?.[op.column] == null ? "" : String(b?.[op.column]);
      const cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
      return op.dir === "asc" ? cmp : -cmp;
    });
    return { ...working, rows: outRows as never, meta: { ...working.meta, createdAt: Date.now() } };
  }
  return working;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6: ColType Badge — unchanged from v3.0
// ─────────────────────────────────────────────────────────────────────────────

function ColTypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    date: "border-blue-200 bg-blue-50 text-blue-700",
    currency: "border-emerald-200 bg-emerald-50 text-emerald-700",
    number: "border-slate-200 bg-slate-100 text-slate-600",
    string: "border-slate-200 bg-white text-slate-500",
    empty: "border-rose-200 bg-rose-50 text-rose-600",
  };
  return <span className={cx("inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", map[type] ?? map["string"])}>{type}</span>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7: Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SqlSandboxView() {
  const nav = useNavigate();
  const { baseDataset, dataset, transforms, schema, dashboard } = useDatasetStore();

  // UI state
  const [expand, setExpand] = useState(false);
  const [sqlText, setSqlText] = useState("SELECT * FROM dataset LIMIT 100;");
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGeneratingSql, setIsGeneratingSql] = useState(false);
  const [isApplyingPlaybook, setIsApplyingPlaybook] = useState(false);
  const [lastRunQuery, setLastRunQuery] = useState<string | null>(null);
  const [queryMs, setQueryMs] = useState<number | null>(null);
  const [resultsPage, setResultsPage] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<"schema" | "history" | "dq">("schema");
  const [queryHistory, setQueryHistory] = useState<HistoryEntry[]>([]);

  // Transform form state
  const [selectList, setSelectList] = useState<string[]>([]);
  const [deleteList, setDeleteList] = useState<string[]>([]);
  const [dedupeKeys, setDedupeKeys] = useState<string[]>([]);
  const [pickCol, setPickCol] = useState("");
  const [fillCol, setFillCol] = useState("");
  const [fillVal, setFillVal] = useState("");
  const [sortCol, setSortCol] = useState("");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [castCol, setCastCol] = useState("");
  const [renameFrom, setRenameFrom] = useState("");
  const [renameTo, setRenameTo] = useState("");

  const sqlStartRef = useRef(0);

  // ── FIX 1: DuckDB hook — refreshDatasetTable called on dataset/schema change ──
  const { isReady, isInitializing, isRunning, error: sqlError, result: sqlResult, runQuery, refreshDatasetTable } = useDuckDBQueryRunner(dataset);

  // ── FIX 1 CORE: Re-register DuckDB table whenever dataset OR schema changes ──
  // This ensures type overrides committed in SchemaDetectionView are immediately
  // reflected in the DuckDB table schema — not just the JS rows array.
  useEffect(() => {
    if (!isReady || !dataset) return;
    void refreshDatasetTable();
  }, [isReady, dataset, schema]);
  // ── End Fix 1 ────────────────────────────────────────────────────────────────

  // Derived data
  const cols = useMemo(() => dataset?.columns ?? [], [dataset]);
  const colRefs = useMemo<ColRef[]>(() => {
    if (!cols.length) return [];
    const rows = (dataset?.rows ?? []) as QueryRow[];
    const schemaMap = new Map<string, string>((schema ?? []).map(p => [p.name, String(p.assignedType ?? p.inferredType ?? "string")]));
    return cols.map(c => ({ name: c, type: schemaMap.get(c) ?? inferColType(c, rows) }));
  }, [cols, dataset?.rows, schema]);

  const previewRows = useMemo(() => ((dataset?.rows as QueryRow[] | undefined) ?? []).slice(0, 200), [dataset]);
  const dq = useMemo(() => computeDQ(dataset), [dataset]);

  const resultColumns = sqlResult?.columns ?? [];
  const resultRows = (sqlResult?.rows ?? []) as QueryRow[];
  const totalResultPages = Math.max(1, Math.ceil(resultRows.length / RESULTS_PAGE_SIZE));
  const pagedRows = resultRows.slice(resultsPage * RESULTS_PAGE_SIZE, (resultsPage + 1) * RESULTS_PAGE_SIZE);

  // ── AI Audit badge — derived from store ──────────────────────────────────
  const auditPattern = dashboard?.audit?.detectedPattern ?? null;

  const tourSteps = useMemo(() => [
    { id: "s1", title: "Transform Data fast", body: "Use dropdown pickers and multi-select chips. Add steps and preview updates instantly.", anchorId: "sb-header", placement: "bottom" as const },
    { id: "s2", title: "Operational playbooks", body: "Use Bank or Sales cleanup playbooks to fix common export problems in one click.", anchorId: "sb-playbook", placement: "bottom" as const },
    { id: "s3", title: "Data quality signals", body: "DQ panel flags duplicates, empty columns, and GSTIN issues offline.", anchorId: "sb-dq", placement: "left" as const },
  ], []);

  // ── Pipeline management — unchanged from v3.0 ────────────────────────────
  const recompute = (nextTransforms: TransformStep[]) => {
    if (!baseDataset) return;
    const pipelineSafeOps = nextTransforms.map(t => t.op as { kind?: string }).filter(op => !["row1Header", "trimAllText", "dropEmptyRows", "dropEmptyCols", "fillNulls", "sort"].includes(op.kind ?? ""));
    let next = applyTransformPipeline(baseDataset, pipelineSafeOps as never);
    for (const t of nextTransforms) next = applyLocalExtra(next, t);
    datasetStore.set({ dataset: next, transforms: nextTransforms, transformMode: "sql-manual", profiles: null, dashboard: null, report: null });
  };
  const addStep = (step: TransformStep) => recompute([...(transforms ?? []), step]);
  const removeStep = (id: string) => recompute((transforms ?? []).filter(t => t.id !== id));
  const moveStep = (id: string, dir: -1 | 1) => {
    const arr = [...(transforms ?? [])];
    const idx = arr.findIndex(t => t.id === id);
    if (idx < 0) return;
    const nidx = idx + dir;
    if (nidx < 0 || nidx >= arr.length) return;
    [arr[idx], arr[nidx]] = [arr[nidx]!, arr[idx]!];
    recompute(arr);
  };
  const resetToBase = () => {
    if (!baseDataset) return;
    datasetStore.set({ dataset: baseDataset, transforms: [], transformMode: null, profiles: null, dashboard: null, report: null });
    toast.message("Reset", { description: "Reverted to base snapshot." });
  };
  const commitAsBase = () => {
    if (!dataset) return;
    datasetStore.set({ baseDataset: dataset, dataset, transforms: [], transformMode: null, profiles: null, dashboard: null, report: null });
    toast.success("Committed", { description: "Current dataset saved as new base snapshot." });
  };

  // ── Generic cleanup helpers — unchanged from v3.0 ────────────────────────
  const applyGenericCleanup = () => {
    const steps: TransformStep[] = [buildStep("Trim all text", { kind: "trimAllText" }), buildStep("Drop empty rows", { kind: "dropEmptyRows" }), buildStep("Drop empty columns", { kind: "dropEmptyCols" })];
    recompute([...(transforms ?? []), ...steps]);
    toast.success("Generic cleanup applied");
  };
  const applyRow1Header = () => { addStep(buildStep("First row → header", { kind: "row1Header" })); toast.success("First row promoted to header."); };
  const applyTypeCast = (to: "number" | "date" | "text") => {
    if (!cols.includes(castCol)) { toast.error("Select a column to cast."); return; }
    addStep(buildStep(`Cast ${colLabel(castCol)} → ${to}`, { kind: "cast", column: castCol, to }));
    toast.success(`${colLabel(castCol)} cast to ${to}`);
  };
  const toggleInList = (list: string[], col: string) => {
    if (!col || col === "") return list;
    return list.includes(col) ? list.filter(x => x !== col) : [...list, col];
  };
  const addPickedTo = (which: "select" | "delete" | "dedupe") => {
    const c = pickCol;
    if (!cols.includes(c)) return;
    if (which === "select") setSelectList(p => unique([...p, c]));
    if (which === "delete") setDeleteList(p => unique([...p, c]));
    if (which === "dedupe") setDedupeKeys(p => unique([...p, c]));
  };
  const applyDedupe = () => {
    if (!dedupeKeys.length) { toast.error("Pick at least one dedupe key."); return; }
    addStep(buildStep(`Dedupe ${dedupeKeys.length}`, { kind: "dedupe", keyColumns: dedupeKeys }));
    toast.success("Dedupe step added.");
  };

  // ── Playbooks — unchanged from v3.0 ──────────────────────────────────────
  const runPlaybook = async (kind: "generic" | "bank" | "sales") => {
    if (!dataset) return;
    setIsApplyingPlaybook(true);
    try {
      const steps: TransformStep[] = [];
      steps.push(buildStep("Trim all text", { kind: "trimAllText" }));
      steps.push(buildStep("Drop empty rows", { kind: "dropEmptyRows" }));
      steps.push(buildStep("Drop empty columns", { kind: "dropEmptyCols" }));
      const c = dataset.columns ?? [];
      const n = (x: string) => c.find(cc => norm(cc) === x || norm(cc).includes(x)) ?? "";
      if (kind === "bank") {
        const dateCol = n("date") || n("value date") || n("txn date");
        const descCol = n("narration") || n("description") || n("particular");
        const debit = n("debit");
        const credit = n("credit");
        if (dateCol) steps.push(buildStep(`Cast date: ${dateCol}`, { kind: "cast", column: dateCol, to: "date" }));
        if (debit) steps.push(buildStep(`Cast number: ${debit}`, { kind: "cast", column: debit, to: "number" }));
        if (credit) steps.push(buildStep(`Cast number: ${credit}`, { kind: "cast", column: credit, to: "number" }));
        if (descCol) steps.push(buildStep(`Rename ${descCol} → narration`, { kind: "rename", from: descCol, to: "narration" }));
      }
      if (kind === "sales") {
        const dateCol = n("date") || n("invoice date");
        const amt = n("amount") || n("total");
        const gstin = n("gstin");
        if (dateCol) steps.push(buildStep(`Cast date: ${dateCol}`, { kind: "cast", column: dateCol, to: "date" }));
        if (amt) steps.push(buildStep(`Cast number: ${amt}`, { kind: "cast", column: amt, to: "number" }));
        if (gstin) steps.push(buildStep(`Rename ${gstin} → gstin`, { kind: "rename", from: gstin, to: "gstin" }));
      }
      await new Promise(r => setTimeout(r, 200));
      recompute([...(transforms ?? []), ...steps]);
      toast.success("Playbook applied", { description: `${kind.toUpperCase()} cleanup — ${steps.length} steps added.` });
    } finally {
      setIsApplyingPlaybook(false);
    }
  };

  // ── SQL Runner — refreshDatasetTable called before every query ────────────
  const handleRunSql = async () => {
    if (!dataset) { toast.error("No dataset loaded."); return; }
    if (!sqlText.trim()) { toast.error("SQL editor is empty."); return; }
    try {
      sqlStartRef.current = performance.now();
      await refreshDatasetTable(); // ensures latest schema/rows in DuckDB
      const res = await runQuery(sqlText);
      const elapsed = Math.round(performance.now() - sqlStartRef.current);
      if (res) {
        setLastRunQuery(sqlText);
        setQueryMs(elapsed);
        setResultsPage(0);
        setQueryHistory(prev => [{ id: uid(), sql: sqlText, ms: elapsed, rowCount: res.rowCount, ts: Date.now() }, ...prev].slice(0, MAX_HISTORY));
        toast.success("Query executed", { description: `${res.rowCount.toLocaleString()} rows · ${elapsed}ms` });
      } else {
        toast.error("Query failed", { description: sqlError ?? "Unknown SQL error" });
      }
    } catch (err) {
      toast.error("Query failed", { description: err instanceof Error ? err.message : "Unknown DuckDB error" });
    }
  };

  // ── FIX 3: AI SQL Assistant — real POST to /api/audit ────────────────────
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) { toast.error("Describe what you need."); return; }
    setIsGeneratingSql(true);
    try {
      const sampleRows = ((dataset?.rows ?? []) as QueryRow[]).slice(0, 10);
     // ✅ CORRECT — datasetStore.get() is the synchronous store accessor
     const detectedPattern = dashboard?.audit?.detectedPattern ?? datasetStore.get()?.signals?.inferredPattern ?? "General Enterprise";

      const systemPrompt = `You are a SQL expert. Respond in English only. 
Based on these columns and sample data, write a DuckDB-compatible SQL query to answer the user's question. 
Return ONLY the SQL code — no explanation, no markdown, no comments.`;
      const userContext = `Columns: ${(dataset?.columns ?? []).join(", ")}\nDetected Pattern: ${detectedPattern}\nSample rows (JSON):\n${JSON.stringify(sampleRows, null, 2)}`;

      let generated: string | null = null;

      try {
        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "sql-generate",
            systemPrompt,
            userContext,
            columns: dataset?.columns ?? [],
            sampleRows,
            detectedPattern,
          }),
        });

        if (res.ok) {
          const json = await res.json() as Record<string, unknown>;
          // Accept either { sql: "..." } or { reasoning: "..." } or raw text
          const raw = (json.sql ?? json.reasoning ?? json.text ?? "") as string;
          if (typeof raw === "string" && raw.trim()) generated = raw.trim();
        }
      } catch {
        // Network/API unavailable — fall through to heuristic
      }

      // Fallback to heuristic generator if API unavailable or returned empty
      if (!generated) {
        generated = inferAiSql(aiPrompt, dataset);
        toast.success("SQL generated (heuristic)", { description: "AI endpoint unavailable — heuristic used." });
      } else {
        toast.success("SQL generated by AI");
      }

      setSqlText(generated);
    } finally {
      setIsGeneratingSql(false);
    }
  };
  // ── End Fix 3 ────────────────────────────────────────────────────────────

  const applySqlResultToDataset = () => {
    if (!sqlResult) { toast.error("No SQL result available."); return; }
    const nextSource = (dataset?.meta?.source ?? "manual") as DatasetSource;
    const nextDataset: Dataset = {
      columns: sqlResult.columns ?? [],
      rows: (sqlResult.rows ?? []) as never,
      meta: { name: dataset?.meta?.name ?? "dataset-sql-result", rows: sqlResult.rows?.length ?? 0, cols: sqlResult.columns?.length ?? 0, createdAt: Date.now(), source: nextSource, bytes: dataset?.meta?.bytes ?? 0 },
    };
    datasetStore.set({ dataset: nextDataset, transformMode: "sql-query-result", dashboard: null, report: null, profiles: null });
    toast.success("Dataset updated", { description: "Visual & Health steps now reflect the SQL result." });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Empty state — unchanged from v3.0
  // ─────────────────────────────────────────────────────────────────────────

  if (!dataset) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 font-sans">
        <Card className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
              <TerminalSquare className="h-5 w-5 text-slate-400" />
            </div>
            <CardTitle className="text-lg font-semibold text-slate-900">No dataset loaded</CardTitle>
            <CardDescription className="text-sm text-slate-500">Upload a file and complete Schema Detection before using the SQL Sandbox.</CardDescription>
          </CardHeader>
          <div className="flex gap-2 px-6 pb-6">
            <Button variant="outline" size="sm" onClick={() => nav("/app/schema")}><ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Back to Schema</Button>
            <Button size="sm" className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => nav("/app/upload")}>Upload Data<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
          </div>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Expanded full-dataset modal — unchanged from v3.0
  // ─────────────────────────────────────────────────────────────────────────

  if (expand) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 text-white">
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Expanded preview</p>
            <h2 className="mt-0.5 text-sm font-semibold">Dataset preview</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{dataset.meta.rows.toLocaleString()} rows · {dataset.columns.length} cols</span>
            <Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:bg-slate-800" onClick={() => setExpand(false)}><X className="mr-1.5 h-3.5 w-3.5" />Close</Button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <table className="min-w-full border-collapse text-xs">
            <thead><tr>{cols.map(c => <th key={c} className="whitespace-nowrap border border-slate-700 bg-slate-800 px-3 py-2 text-left font-medium text-slate-300">{colLabel(c)}</th>)}</tr></thead>
            <tbody>{(dataset.rows as QueryRow[]).slice(0, 2000).map((r, i) => (<tr key={i} className="hover:bg-slate-800/50">{cols.map(c => <td key={c} className="whitespace-nowrap border border-slate-800 px-3 py-1.5 text-slate-300">{String(r?.[c] ?? "")}</td>)}</tr>))}</tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">Showing first 2,000 rows.</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main render — UI structure unchanged from v3.0
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <GuidedTour steps={tourSteps} tourKey="sql-sandbox" />
      <div className="mx-auto max-w-[1440px] px-4 py-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* PAGE HEADER */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6" id="sb-header">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500"> AutoAnalyst · Step 3 of 6 </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">SQL Sandbox</h1>
            <p className="mt-1.5 text-sm text-slate-500">Write, run, and transform — DuckDB executes locally. No data leaves your browser.</p>

            {/* Status badges */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">{dataset?.meta?.name ?? "dataset"}</Badge>
              <Badge variant="secondary" className="text-xs">{dataset.meta.rows.toLocaleString()} rows · {dataset.columns.length} cols</Badge>
              <Badge variant="secondary" className="text-xs">Steps: {transforms?.length ?? 0}</Badge>
              {isReady && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />DuckDB ready
                </span>
              )}
              {isInitializing && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  <Loader2 className="h-3 w-3 animate-spin" />DuckDB initializing
                </span>
              )}
              {/* FIX 4: AI Audit Active badge */}
              {auditPattern && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                  <Sparkles className="h-3 w-3" />AI Audit Active: {auditPattern}
                </span>
              )}
            </div>
          </div>

          {/* TOP-RIGHT NAV */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetToBase} disabled={!baseDataset}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset
            </Button>
            <Button variant="outline" size="sm" onClick={commitAsBase} disabled={!dataset}>
              <Save className="mr-1.5 h-3.5 w-3.5" />Commit base
            </Button>
            <Button variant="outline" size="sm" onClick={() => { const csv = toCsv(dataset.columns ?? [], (dataset.rows ?? []) as QueryRow[]); downloadText(dataset.meta.name ?? "dataset-cleaned.csv", csv, "text/csv"); toast.success("Exported cleaned CSV."); }}>
              <Download className="mr-1.5 h-3.5 w-3.5" />Export CSV
            </Button>
            <Button variant="outline" onClick={() => nav("/app/schema")}>
             Back 
            </Button>
            <Button className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => nav("/app/visuals")}>
              Next Visuals
            </Button>
          </div>
        </div>

        {/* MAIN LAYOUT */}
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">

          {/* LEFT COLUMN */}
          <div className="min-w-0 space-y-5">

            {/* AI Assistant Bar */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-[#2185fb]" />
                  <p className="text-xs font-semibold text-slate-700">AI SQL Assistant</p>
                  <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                    {auditPattern ? `Pattern: ${auditPattern}` : "Offline heuristics"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      value={aiPrompt}
                      onChange={e => setAiPrompt(e.target.value)}
                      placeholder="Ask a question e.g. Show top 5 customers by revenue"
                      className="h-10 pr-4 text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-300"
                      onKeyDown={e => { if (e.key === "Enter") void handleAiGenerate(); }}
                    />
                  </div>
                  <Button onClick={() => void handleAiGenerate()} disabled={isGeneratingSql || !aiPrompt.trim()} className="h-10 bg-slate-900 px-4 text-white hover:bg-slate-800">
                    {isGeneratingSql ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    <span className="ml-1.5 text-xs">Generate SQL</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* SQL Console */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <TerminalSquare className="h-4 w-4 text-slate-400" />
                    <CardTitle className="text-sm font-semibold text-slate-900">SQL Console</CardTitle>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-500">TABLE: dataset</span>
                  </div>
                  {queryMs !== null && (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                        <Clock className="h-3 w-3 text-slate-400" />{queryMs}ms
                      </span>
                      {sqlResult && (
                        <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                          <Hash className="h-3 w-3 text-slate-400" />{sqlResult.rowCount.toLocaleString()} rows
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">

                {/* FIX 2: Expanded Analyst Templates — 12 total */}
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Templates</span>
                  {[
                    {
                      label: "Summary",
                      onClick: () => setSqlText("SELECT * FROM dataset LIMIT 100;"),
                    },
                    {
                      label: "Aggregator",
                      onClick: () => {
                        const catCol = cols.find(c => ["category", "type", "mode", "item", "customer", "party"].some(k => norm(c).includes(k))) ?? cols[0] ?? "category";
                        const amtCol = cols.find(c => ["amount", "total", "revenue", "sales"].some(k => norm(c).includes(k))) ?? cols[1] ?? "amount";
                        setSqlText(`SELECT ${catCol}, SUM(${amtCol}) AS total\nFROM dataset\nGROUP BY 1\nORDER BY 2 DESC;`);
                      },
                    },
                    {
                      label: "Time-Series",
                      onClick: () => {
                        const dateCol = cols.find(c => norm(c).includes("date") || norm(c).includes("time")) ?? "date";
                        const amtCol = cols.find(c => ["amount", "total", "revenue", "sales"].some(k => norm(c).includes(k))) ?? "amount";
                        setSqlText(`SELECT DATE_TRUNC('month', ${dateCol}) AS month, SUM(${amtCol}) AS total\nFROM dataset\nGROUP BY 1\nORDER BY 1;`);
                      },
                    },
                    {
                      label: "Deduplicate",
                      onClick: () => setSqlText("SELECT DISTINCT *\nFROM dataset;"),
                    },
                    {
                      label: "Drop Nulls",
                      onClick: () => {
                        const numCol = cols.find(c => ["amount", "total", "revenue", "sales", "debit", "credit"].some(k => norm(c).includes(k))) ?? cols[0] ?? "amount";
                        setSqlText(`SELECT *\nFROM dataset\nWHERE ${numCol} IS NOT NULL;`);
                      },
                    },
                    // ── Analyst-Grade Templates ──────────────────────────────
                    {
                      label: "Standardize Text",
                      onClick: () => {
                        const catCol = cols.find(c => ["category", "type", "name", "item"].some(k => norm(c).includes(k))) ?? cols[0] ?? "category";
                        setSqlText(`SELECT *, UPPER(TRIM(${catCol})) AS ${catCol}_clean\nFROM dataset;`);
                      },
                    },
                    {
                      label: "Fix Revenue",
                      onClick: () => {
                        const amtCol = cols.find(c => ["amount", "total", "revenue", "sales"].some(k => norm(c).includes(k))) ?? cols[0] ?? "amount";
                        setSqlText(`SELECT *, COALESCE(TRY_CAST(${amtCol} AS DOUBLE), 0) AS ${amtCol}_fixed\nFROM dataset;`);
                      },
                    },
                    {
                      label: "Remove Dupes",
                      onClick: () => setSqlText("SELECT *\nFROM dataset\nGROUP BY ALL\nHAVING COUNT(*) = 1;"),
                    },
                    {
                      label: "MoM Growth",
                      onClick: () => {
                        const dateCol = cols.find(c => norm(c).includes("date") || norm(c).includes("time")) ?? "date";
                        const amtCol = cols.find(c => ["amount", "total", "revenue", "sales"].some(k => norm(c).includes(k))) ?? "amount";
                        setSqlText(`SELECT DATE_TRUNC('month', ${dateCol}) AS month, SUM(${amtCol}) AS revenue\nFROM dataset\nGROUP BY 1\nORDER BY 1;`);
                      },
                    },
                    {
                      label: "Pareto Top 10",
                      onClick: () => {
                        const catCol = cols.find(c => ["category", "type", "item", "customer", "party"].some(k => norm(c).includes(k))) ?? cols[0] ?? "category";
                        const amtCol = cols.find(c => ["amount", "total", "revenue", "sales"].some(k => norm(c).includes(k))) ?? cols[1] ?? "amount";
                        setSqlText(`SELECT ${catCol}, SUM(${amtCol}) AS total\nFROM dataset\nGROUP BY 1\nORDER BY 2 DESC\nLIMIT 10;`);
                      },
                    },
                    {
                      label: "Weekday Pattern",
                      onClick: () => {
                        const dateCol = cols.find(c => norm(c).includes("date") || norm(c).includes("time")) ?? "date";
                        const amtCol = cols.find(c => ["amount", "total", "revenue", "sales"].some(k => norm(c).includes(k))) ?? "amount";
                        setSqlText(`SELECT DAYNAME(${dateCol}) AS day_of_week, AVG(${amtCol}) AS avg_value\nFROM dataset\nGROUP BY 1\nORDER BY DAYOFWEEK(${dateCol});`);
                      },
                    },
                    {
                      label: "Outlier Detect",
                      onClick: () => {
                        const amtCol = cols.find(c => ["amount", "total", "revenue", "sales", "debit", "credit"].some(k => norm(c).includes(k))) ?? cols[0] ?? "amount";
                        setSqlText(`SELECT *\nFROM dataset\nWHERE ${amtCol} > (\n  SELECT AVG(${amtCol}) + 2 * STDDEV(${amtCol}) FROM dataset\n);`);
                      },
                    },
                    {
                      label: "Data Quality",
                      onClick: () => {
                        const amtCol = cols.find(c => ["amount", "total", "revenue", "sales"].some(k => norm(c).includes(k))) ?? cols[0] ?? "amount";
                        setSqlText(`SELECT\n  COUNT(*) AS total_rows,\n  COUNT(${amtCol}) AS non_null_count,\n  (COUNT(*) - COUNT(${amtCol})) AS missing_values\nFROM dataset;`);
                      },
                    },
                    {
                      label: "Concentration",
                      onClick: () => {
                        const custCol = cols.find(c => ["customer", "client", "party", "name"].some(k => norm(c).includes(k))) ?? cols[0] ?? "customer";
                        const amtCol = cols.find(c => ["amount", "total", "revenue", "sales"].some(k => norm(c).includes(k))) ?? cols[1] ?? "amount";
                        setSqlText(`SELECT ${custCol},\n  (SUM(${amtCol}) * 100.0 / (SELECT SUM(${amtCol}) FROM dataset)) AS percent_of_total\nFROM dataset\nGROUP BY 1\nORDER BY 2 DESC\nLIMIT 5;`);
                      },
                    },
                  ].map(tpl => (
                    <button
                      key={tpl.label}
                      type="button"
                      onClick={tpl.onClick}
                      className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-all hover:border-slate-400 hover:bg-slate-50 active:scale-95"
                    >
                      {tpl.label}
                    </button>
                  ))}
                </div>

                {/* SQL Editor */}
                <div className="relative bg-[#0f1117] rounded-none">
                  <div className="flex items-center justify-between border-b border-slate-700/50 px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    </div>
                    <span className="font-mono text-[10px] text-slate-500">query.sql</span>
                    <span className="text-[10px] text-slate-500">DuckDB-WASM · offline</span>
                  </div>
                  <textarea
                    value={sqlText}
                    onChange={e => setSqlText(e.target.value)}
                    className="min-h-[380px] w-full resize-y bg-transparent p-4 font-mono text-sm text-slate-100 outline-none placeholder:text-slate-600"
                    spellCheck={false}
                    placeholder="SELECT * FROM dataset LIMIT 100"
                    onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); void handleRunSql(); } }}
                  />
                </div>

                {/* Editor footer */}
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-white px-4 py-3">
                  <Button onClick={() => void handleRunSql()} disabled={isRunning || !isReady} className="h-9 bg-slate-900 px-5 text-white hover:bg-slate-800">
                    {isRunning ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
                    {isRunning ? "Running…" : "Run SQL"}
                    <kbd className="ml-2 rounded bg-white/15 px-1.5 py-0.5 text-[10px]">⌘↵</kbd>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setSqlText("SELECT * FROM dataset LIMIT 100;"); setQueryMs(null); }} disabled={isRunning} className="h-9">
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadText("query.sql", sqlText, "text/sql")} disabled={!sqlText.trim()} className="h-9">
                    <Download className="mr-1.5 h-3.5 w-3.5" />Export SQL
                  </Button>
                  {sqlResult && (
                    <Button variant="outline" size="sm" onClick={applySqlResultToDataset} className="h-9 ml-auto border-[#2185fb] text-[#2185fb] hover:bg-blue-50">
                      <Save className="mr-1.5 h-3.5 w-3.5" />Use Result as Dataset
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* SQL Error */}
            <AnimatePresence>
              {sqlError && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                  <p className="font-mono text-xs text-rose-800">{sqlError}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Performance status bar */}
            <AnimatePresence>
              {queryMs !== null && sqlResult && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-sm text-slate-700"><Clock className="h-4 w-4 text-slate-400" /><span className="font-semibold">Query executed in {queryMs}ms</span></div>
                  <div className="flex items-center gap-2 text-sm text-slate-700"><Hash className="h-4 w-4 text-slate-400" /><span>Rows returned </span><span className="font-semibold">{sqlResult.rowCount.toLocaleString()}</span></div>
                  <div className="flex items-center gap-2 text-sm text-slate-700"><Database className="h-4 w-4 text-slate-400" /><span>Columns </span><span className="font-semibold">{resultColumns.length}</span></div>
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" />Success</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Paginated Results Table */}
            <AnimatePresence>
              {sqlResult && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                  <Card className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-slate-400" />
                          <CardTitle className="text-sm font-semibold text-slate-900">Query Results</CardTitle>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{sqlResult.rowCount.toLocaleString()} rows · {resultColumns.length} cols</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={resultsPage === 0} onClick={() => setResultsPage(p => Math.max(0, p - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>
                          <span className="text-xs text-slate-500">{resultsPage + 1} / {totalResultPages}</span>
                          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={resultsPage >= totalResultPages - 1} onClick={() => setResultsPage(p => Math.min(totalResultPages - 1, p + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { const csv = toCsv(resultColumns, resultRows); downloadText("sql-result.csv", csv, "text/csv"); toast.success("SQL result exported as CSV."); }}><Download className="mr-1.5 h-3 w-3" />Export CSV</Button>
                          <Button size="sm" className="h-7 bg-slate-900 text-white text-xs hover:bg-slate-800" onClick={applySqlResultToDataset}><Save className="mr-1.5 h-3 w-3" />Apply to Dataset</Button>
                        </div>
                      </div>
                    </CardHeader>
                    <div className="overflow-x-auto">
                      <table className="min-w-full border-collapse text-left">
                        <thead><tr>{resultColumns.map(col => <th key={col} className="whitespace-nowrap border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-slate-500">{col}</th>)}</tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {pagedRows.length ? pagedRows.map((row, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">{resultColumns.map(col => <td key={col} className="whitespace-nowrap px-4 py-2 text-sm text-slate-700">{String(row?.[col] ?? "")}</td>)}</tr>
                          )) : (
                            <tr><td colSpan={resultColumns.length} className="px-4 py-8 text-center text-sm text-slate-400">Query returned no rows</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-2.5">
                      <p className="text-xs text-slate-400">Showing rows {resultsPage * RESULTS_PAGE_SIZE + 1}–{Math.min((resultsPage + 1) * RESULTS_PAGE_SIZE, sqlResult.rowCount)} of {sqlResult.rowCount.toLocaleString()}</p>
                    </div>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Playbook Bar */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm" id="sb-playbook">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-slate-400" /><CardTitle className="text-sm font-semibold text-slate-900">Playbooks & Cleanup</CardTitle></div>
                <CardDescription className="text-xs text-slate-400">One-click recipes for common export problems. Adds steps — reorder or remove anytime.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Generic cleanup</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={applyRow1Header}>First Row → Header</Button>
                    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={applyGenericCleanup} disabled={isApplyingPlaybook}>
                      {isApplyingPlaybook ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}Trim + Drop empty rows/cols
                    </Button>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Domain playbooks</p>
                  <div className="flex flex-wrap gap-2">
                    {(["generic", "bank", "sales"] as const).map(pb => (
                      <Button key={pb} variant="outline" size="sm" className="h-8 text-xs" onClick={() => void runPlaybook(pb)} disabled={isApplyingPlaybook}>
                        {isApplyingPlaybook ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}{pb.charAt(0).toUpperCase() + pb.slice(1)}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Type Cast */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2"><Type className="h-4 w-4 text-slate-400" /><CardTitle className="text-sm font-semibold text-slate-900">Type Cast</CardTitle></div>
                <CardDescription className="text-xs text-slate-400">Override schema engine type inference before visualization.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={castCol ? encodeCol(castCol) : SEL_NONE} onValueChange={v => setCastCol(decodeCol(v))}>
                    <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder="Column to cast" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEL_NONE}>not selected</SelectItem>
                      {cols.map((c, idx) => <SelectItem key={idx} value={encodeCol(c)}>{colLabel(c)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {(["number", "date", "text"] as const).map(t => (
                    <Button key={t} variant="outline" size="sm" className="h-9 text-xs" disabled={!cols.includes(castCol)} onClick={() => applyTypeCast(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Transforms: Fill, Sort, Rename */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-slate-400" /><CardTitle className="text-sm font-semibold text-slate-900">Fill, Sort, Rename</CardTitle></div>
                <CardDescription className="text-xs text-slate-400">Operational formatting before schema and visuals.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-5">
                {/* Fill nulls */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Fill Nulls</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={fillCol ? encodeCol(fillCol) : SEL_NONE} onValueChange={v => setFillCol(decodeCol(v))}>
                      <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Column" /></SelectTrigger>
                      <SelectContent><SelectItem value={SEL_NONE}>not selected</SelectItem>{cols.map((c, i) => <SelectItem key={i} value={encodeCol(c)}>{colLabel(c)}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={fillVal} onChange={e => setFillVal(e.target.value)} className="h-9 w-40 text-sm" placeholder="Fill value" />
                    <Button variant="outline" size="sm" className="h-9 text-xs" disabled={!cols.includes(fillCol)} onClick={() => addStep(buildStep(`Fill nulls: ${colLabel(fillCol)}`, { kind: "fillNulls", column: fillCol, value: fillVal }))}>Apply Fill</Button>
                  </div>
                </div>
                {/* Sort */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Sort</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={sortCol ? encodeCol(sortCol) : SEL_NONE} onValueChange={v => setSortCol(decodeCol(v))}>
                      <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Column" /></SelectTrigger>
                      <SelectContent><SelectItem value={SEL_NONE}>not selected</SelectItem>{cols.map((c, i) => <SelectItem key={i} value={encodeCol(c)}>{colLabel(c)}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={sortDir} onValueChange={v => setSortDir(v as SortDir)}>
                      <SelectTrigger className="h-9 w-36 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="asc">Ascending</SelectItem><SelectItem value="desc">Descending</SelectItem></SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" className="h-9 text-xs" disabled={!cols.includes(sortCol)} onClick={() => addStep(buildStep(`Sort ${colLabel(sortCol)} ${sortDir}`, { kind: "sort", column: sortCol, dir: sortDir }))}>Apply Sort</Button>
                  </div>
                </div>
                {/* Rename */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Rename Column</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={renameFrom ? encodeCol(renameFrom) : SEL_NONE} onValueChange={v => setRenameFrom(decodeCol(v))}>
                      <SelectTrigger className="h-9 w-40 text-sm"><SelectValue placeholder="Column" /></SelectTrigger>
                      <SelectContent><SelectItem value={SEL_NONE}>not selected</SelectItem>{cols.map((c, i) => <SelectItem key={i} value={encodeCol(c)}>{colLabel(c)}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={renameTo} onChange={e => setRenameTo(e.target.value)} className="h-9 w-40 text-sm" placeholder="New name" />
                    <Button variant="outline" size="sm" className="h-9 text-xs" disabled={!cols.includes(renameFrom) || !renameTo.trim()} onClick={() => { if (!cols.includes(renameFrom) || !renameTo.trim()) { toast.error("Select a column and enter a new name."); return; } addStep(buildStep(`Rename ${renameFrom} → ${renameTo.trim()}`, { kind: "rename", from: renameFrom, to: renameTo.trim() })); }}>Apply Rename</Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Column Ops */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2"><Hash className="h-4 w-4 text-slate-400" /><CardTitle className="text-sm font-semibold text-slate-900">Select, Delete, Dedupe</CardTitle></div>
                <CardDescription className="text-xs text-slate-400">Multi-select column operations without typing.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={pickCol ? encodeCol(pickCol) : SEL_NONE} onValueChange={v => setPickCol(decodeCol(v))}>
                    <SelectTrigger className="h-9 w-48 text-sm"><SelectValue placeholder="Pick column" /></SelectTrigger>
                    <SelectContent><SelectItem value={SEL_NONE}>not selected</SelectItem>{cols.map((c, i) => <SelectItem key={i} value={encodeCol(c)}>{colLabel(c)}</SelectItem>)}</SelectContent>
                  </Select>
                  {(["select", "delete", "dedupe"] as const).map(action => (
                    <Button key={action} variant="outline" size="sm" className="h-9 text-xs" disabled={!cols.includes(pickCol)} onClick={() => addPickedTo(action)}>{action.charAt(0).toUpperCase() + action.slice(1)}</Button>
                  ))}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {([
                    { label: "Select list", list: selectList, setList: setSelectList, action: () => addStep(buildStep(`Select ${selectList.length}`, { kind: "select", columns: selectList })), actionLabel: "Apply Select" },
                    { label: "Delete list", list: deleteList, setList: setDeleteList, action: () => addStep(buildStep(`Delete ${deleteList.length}`, { kind: "delete", columns: deleteList })), actionLabel: "Apply Delete" },
                    { label: "Dedupe keys", list: dedupeKeys, setList: setDedupeKeys, action: applyDedupe, actionLabel: "Apply Dedupe" },
                  ]).map(section => (
                    <div key={section.label} className="rounded-lg border border-slate-100 bg-slate-50/70 p-3">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{section.label}</p>
                      <div className="flex min-h-[36px] flex-wrap gap-1.5">
                        {section.list.length ? section.list.map(c => (
                          <button key={c} type="button" className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700" onClick={() => section.setList(p => toggleInList(p, c))}>
                            {colLabel(c)}<X className="ml-1 h-2.5 w-2.5" />
                          </button>
                        )) : <span className="text-xs text-slate-400">Empty</span>}
                      </div>
                      <Button variant="outline" size="sm" className="mt-2 h-7 w-full text-xs" disabled={!section.list.length} onClick={section.action}>{section.actionLabel}</Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pipeline Steps */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-slate-400" />
                  <CardTitle className="text-sm font-semibold text-slate-900">Pipeline Steps</CardTitle>
                  <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{transforms?.length ?? 0}</span>
                </div>
                <CardDescription className="text-xs text-slate-400">Reorder to see how DNA changes in real time.</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                {!(transforms?.length ?? 0) ? (
                  <p className="py-4 text-center text-xs italic text-slate-400">No steps yet. Try a playbook or add a manual transform.</p>
                ) : (
                  <div className="space-y-2">
                    {(transforms ?? []).map((t, idx) => (
                      <div key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">{idx + 1}</span>
                        <p className="flex-1 text-xs font-medium text-slate-700">{t.label}</p>
                        <span className="text-[10px] text-slate-400">{new Date(t.createdAt).toLocaleTimeString()}</span>
                        <div className="flex items-center gap-1">
                          <button type="button" className="rounded p-1 hover:bg-slate-200" onClick={() => moveStep(t.id, -1)} aria-label="Move up"><ArrowUp className="h-3 w-3 text-slate-500" /></button>
                          <button type="button" className="rounded p-1 hover:bg-slate-200" onClick={() => moveStep(t.id, 1)} aria-label="Move down"><ArrowDown className="h-3 w-3 text-slate-500" /></button>
                          <button type="button" className="rounded p-1 hover:bg-rose-100" onClick={() => removeStep(t.id)} aria-label="Remove"><X className="h-3 w-3 text-slate-400 hover:text-rose-600" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT SIDEBAR */}
          <div className="space-y-5">

            {/* Schema / History / DQ Tabs */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm" id="sb-dq">
              <div className="flex border-b border-slate-100">
                {([
                  { id: "schema", label: "Schema", icon: <Database className="h-3.5 w-3.5" /> },
                  { id: "history", label: "History", icon: <History className="h-3.5 w-3.5" /> },
                  { id: "dq", label: "Data Quality", icon: <Activity className="h-3.5 w-3.5" /> },
                ] as const).map(tab => (
                  <button key={tab.id} type="button" onClick={() => setSidebarTab(tab.id)} className={cx("flex flex-1 items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-all", sidebarTab === tab.id ? "border-b-2 border-slate-900 text-slate-900" : "text-slate-400 hover:text-slate-600")}>
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>
              <CardContent className="p-0">
                <AnimatePresence mode="wait">
                  {sidebarTab === "schema" && (
                    <motion.div key="schema" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <div className="border-b border-slate-100 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-700">Column Map</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">{colRefs.length} columns · click to append to SQL</p>
                      </div>
                      <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-50">
                        {colRefs.length ? colRefs.map((ref, idx) => (
                          <button key={idx} type="button" onClick={() => { setSqlText(prev => prev.endsWith("\n") ? `${prev.slice(0, -1)} -- ${ref.name}` : `${prev} -- ${ref.name}`); toast(`Column ${ref.name} appended as comment.`); }} className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors">
                            <span className="flex-1 truncate font-mono text-xs text-slate-700">{colLabel(ref.name)}</span>
                            <ColTypeBadge type={ref.type} />
                          </button>
                        )) : <p className="px-4 py-6 text-xs italic text-slate-400">No columns detected.</p>}
                      </div>
                    </motion.div>
                  )}
                  {sidebarTab === "history" && (
                    <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <div className="border-b border-slate-100 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-700">Query History</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">Last {MAX_HISTORY} executed queries — click to restore</p>
                      </div>
                      <div className="max-h-[480px] overflow-y-auto divide-y divide-slate-50">
                        {queryHistory.length === 0 ? (
                          <div className="flex flex-col items-center gap-3 px-4 py-8 text-center"><History className="h-8 w-8 text-slate-200" /><p className="text-xs text-slate-400">No queries run yet. Run a query to see history here.</p></div>
                        ) : queryHistory.map(entry => (
                          <button key={entry.id} type="button" onClick={() => { setSqlText(entry.sql); toast("Query restored from history."); }} className="group flex w-full flex-col gap-1.5 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                            <pre className="truncate font-mono text-[11px] text-slate-700 whitespace-nowrap">{entry.sql.split("\n")[0]}</pre>
                            <div className="flex items-center gap-3">
                              <span className="flex items-center gap-1 text-[10px] text-slate-400"><Clock className="h-2.5 w-2.5" />{entry.ms}ms</span>
                              <span className="flex items-center gap-1 text-[10px] text-slate-400"><Hash className="h-2.5 w-2.5" />{entry.rowCount.toLocaleString()} rows</span>
                              <span className="ml-auto text-[10px] text-slate-400">{new Date(entry.ts).toLocaleTimeString()}</span>
                            </div>
                            <span className="text-[10px] text-[#2185fb] opacity-0 group-hover:opacity-100 transition-opacity">Click to restore</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                  {sidebarTab === "dq" && (
                    <motion.div key="dq" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <div className="border-b border-slate-100 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-700">Live Data Quality</p>
                        <p className="mt-0.5 text-[11px] text-slate-400">Offline heuristics — null density, duplicates, format alerts.</p>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { label: "Rows", value: dq.stats.rows.toLocaleString() },
                            { label: "Columns", value: dq.stats.cols },
                            { label: "Null density", value: `${dq.stats.overallNullPct.toFixed(1)}%`, accent: dq.stats.overallNullPct > 20 ? "text-rose-600" : undefined },
                            { label: "Duplicate-like", value: dq.stats.duplicateLikeRows, accent: dq.stats.duplicateLikeRows > 0 ? "text-amber-600" : undefined },
                          ].map(stat => (
                            <div key={stat.label} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{stat.label}</p>
                              <p className={cx("mt-0.5 text-sm font-semibold", stat.accent ?? "text-slate-900")}>{String(stat.value)}</p>
                            </div>
                          ))}
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div className={cx("h-full rounded-full transition-all", dq.stats.overallNullPct > 40 ? "bg-rose-500" : dq.stats.overallNullPct > 20 ? "bg-amber-500" : "bg-[#2185fb]")} style={{ width: `${Math.min(100, dq.stats.overallNullPct)}%` }} />
                        </div>
                        <div className="space-y-2">
                          {dq.issues.length ? dq.issues.map((x, i) => (
                            <div key={i} className={cx("rounded-lg border px-3 py-2.5", severityTone(x.severity))}>
                              <p className="text-xs font-semibold">{x.title}</p>
                              <p className="mt-0.5 text-[11px] opacity-80">{x.detail}</p>
                            </div>
                          )) : (
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              <p className="text-xs font-semibold text-emerald-800">No major issues detected in the sample.</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>

            {/* Live Preview */}
            <Card className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-100">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400" /><CardTitle className="text-sm font-semibold text-slate-900">Live Preview</CardTitle></div>
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setExpand(true)}><Maximize2 className="mr-1.5 h-3 w-3" />Full view</Button>
                </div>
                <CardDescription className="text-xs text-slate-400">First 200 rows — updates instantly on each step.</CardDescription>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead><tr>{cols.slice(0, 6).map(c => <th key={c} className="whitespace-nowrap border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-slate-500">{colLabel(c)}</th>)}</tr></thead>
                  <tbody className="divide-y divide-slate-50">
                    {previewRows.length ? previewRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">{cols.slice(0, 6).map(c => <td key={c} className="max-w-[140px] truncate whitespace-nowrap px-3 py-1.5 text-xs text-slate-700">{String(r?.[c] ?? "")}</td>)}</tr>
                    )) : <tr><td colSpan={6} className="px-3 py-6 text-center text-xs text-slate-400">No preview rows available</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { const csv = toCsv(dataset.columns ?? [], (dataset.rows ?? []) as QueryRow[]); downloadText(dataset.meta.name ?? "dataset-cleaned.csv", csv, "text/csv"); toast.success("Exported cleaned CSV."); }}>
                  <Download className="mr-1.5 h-3 w-3" />Export CSV
                </Button>
                <Button size="sm" className="h-7 bg-slate-900 text-white text-xs hover:bg-slate-800" onClick={commitAsBase}>
                  <Save className="mr-1.5 h-3 w-3" />Commit as base
                </Button>
              </div>
            </Card>

          </div>
        </div>
      </div>
    </div>
  );
}
