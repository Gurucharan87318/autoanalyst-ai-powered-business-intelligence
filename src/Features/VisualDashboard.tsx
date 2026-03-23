// ─────────────────────────────────────────────────────────────────────────────
// VisualDashboardView.tsx  —  AutoAnalyst Growth Intelligence Engine
//
// Architecture: reads from datasetStore, zero Recharts imports here.
// All chart rendering delegated to VisualDesign.tsx.
//
// Sections:
//   ① Page Header          — Step indicator, status badges, locked top-right nav
//   ② AI Reasoning Panel   — Dual-audit or heuristic insight banner
//   ③ KPI Ribbon           — Grey #f3f4f6 command bar (Revenue, Orders, AOV, Growth)
//   ④ Board Pack Banner    — Pinned chart count + export
//   ⑤ Chart Grid           — 5-7 auto-generated charts from rule engine
//   ⑥ Analyst Edit Mode    — X/Y axis remapping, type override, persisted to store
//   ⑦ Strategy Filter Sidebar — Date / Category / Region — re-runs DuckDB queries
//   ⑧ Drill Modal          — Full-screen chart expansion
//
// Data flow:
//   dataset + schema → getTemplateStrategy() → charts + kpis + transformedData
//   dashboard.audit (written by useDualAudit) → AI reasoning injection
//   datasetStore.dashboard.activeTemplate ← axis/type overrides persisted
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Filter,
  Loader2,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// ── Store ─────────────────────────────────────────────────────────────────────
import {
  datasetStore,
  useDatasetStore,
  type StoredAudit,
} from "@/lib_old/DatasetStore";

// ── Strategy Engine ───────────────────────────────────────────────────────────
import {
  getTemplateStrategy,
  type DataAudit,
  type VisualStrategy,
} from "@/lib/visualstrategies";

// ── Design Components (all Recharts lives in here) ───────────────────────────
// ChartType, ChartPoint, DashboardChart imported from VisualDesign (not
// visualstrategies) so ChartCard.onTypeChange and the inline callback share
// the exact same nominal type — eliminates "implicitly any" on the parameter.
import {
  AIInsightBadge,
  BoardPackBanner,
  ChartCard,
  DrillModal,
  KpiRibbon,
  type ChartPoint,
  type ChartType,
  type DashboardChart,
} from "@/components/VisualDesign";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type RowRecord = Record<string, unknown>;

// Per-chart axis/type overrides written by Analyst Edit Mode
type ChartOverride = {
  type?: ChartType;
  xAxis?: string;   // dimension column name
  yAxis?: string;   // metric column name
};

// Sidebar filter state
type FilterState = {
  dateColumn:     string;
  dateFrom:       string;
  dateTo:         string;
  categoryColumn: string;
  categoryValue:  string;
  regionColumn:   string;
  regionValue:    string;
};

// AI result shape — read from store, never fetched directly in this component
type AiResult = {
  dashboardReasoning: string;
  source: "heuristic-only" | "merged" | "gemini-only" | "openrouter-only";
};

// ─────────────────────────────────────────────────────────────────────────────
// useLocalAiInsight — reads the dual-audit result from store
// No fetch here. useDualAudit (in DatasetStore layer) owns the network call.
// ─────────────────────────────────────────────────────────────────────────────

function useLocalAiInsight(strategy: VisualStrategy | null): {
  aiResult: AiResult | null;
  aiLoading: boolean;
} {
  const [aiResult,  setAiResult]  = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!strategy || ran.current) return;
    ran.current  = true;
    setAiLoading(true);

    // Read store audit — written asynchronously by useDualAudit
    const storeAudit = datasetStore.get().dashboard?.audit;

    setTimeout(() => {
      if (storeAudit && storeAudit.source !== "heuristic") {
        setAiResult({
          dashboardReasoning: storeAudit.reasoning ?? strategy.audit.reasoning ?? "",
          source: (storeAudit.source ?? "heuristic-only") as AiResult["source"],
        });
      } else {
        setAiResult({
          dashboardReasoning: strategy.audit.reasoning ?? "",
          source: "heuristic-only",
        });
      }
      setAiLoading(false);
    }, 400);
  }, [strategy]);

  return { aiResult, aiLoading };
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV export helper
// ─────────────────────────────────────────────────────────────────────────────

function exportChartCsv(chart: DashboardChart, data: ChartPoint[]) {
  const hasSec = data.some((d) => d.secondaryValue !== undefined);
  const header = hasSec ? "label,value,secondaryValue" : "label,value";
  const rows   = data.map((d) =>
    hasSec ? `${d.label},${d.value},${d.secondaryValue ?? ""}` : `${d.label},${d.value}`
  );
  const csv = [header, ...rows].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a   = document.createElement("a");
  a.href = url; a.download = `${chart.id}.csv`; a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// applyFilters — applies sidebar filter state to dataset rows
// Re-runs in-memory (real DuckDB integration would call useDuckDBQueryRunner)
// ─────────────────────────────────────────────────────────────────────────────

function applyFilters(
  rows: RowRecord[],
  filters: FilterState
): RowRecord[] {
  let out = rows;

  // Date range filter
  if (filters.dateColumn && (filters.dateFrom || filters.dateTo)) {
    out = out.filter((r) => {
      const raw  = String(r[filters.dateColumn] ?? "");
      const date = new Date(raw);
      if (isNaN(date.getTime())) return true;
      if (filters.dateFrom && date < new Date(filters.dateFrom)) return false;
      if (filters.dateTo   && date > new Date(filters.dateTo))   return false;
      return true;
    });
  }

  // Category filter
  if (filters.categoryColumn && filters.categoryValue && filters.categoryValue !== "__all__") {
    out = out.filter((r) =>
      String(r[filters.categoryColumn] ?? "").toLowerCase() ===
      filters.categoryValue.toLowerCase()
    );
  }

  // Region filter
  if (filters.regionColumn && filters.regionValue && filters.regionValue !== "__all__") {
    out = out.filter((r) =>
      String(r[filters.regionColumn] ?? "").toLowerCase() ===
      filters.regionValue.toLowerCase()
    );
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// detectFilterColumns — heuristically identifies date / category / region cols
// ─────────────────────────────────────────────────────────────────────────────

function detectFilterColumns(columns: string[]): {
  dateCols:     string[];
  categoryCols: string[];
  regionCols:   string[];
} {
  const DATE_HINTS     = ["date", "day", "month", "year", "time", "created", "posted", "value date", "txn date"];
  const CATEGORY_HINTS = ["category", "group", "type", "segment", "department", "item", "product", "class"];
  const REGION_HINTS   = ["region", "city", "state", "country", "area", "zone", "branch", "location"];

  const lower = (c: string) => c.toLowerCase();

  return {
    dateCols:     columns.filter((c) => DATE_HINTS.some((h) => lower(c).includes(h))),
    categoryCols: columns.filter((c) => CATEGORY_HINTS.some((h) => lower(c).includes(h))),
    regionCols:   columns.filter((c) => REGION_HINTS.some((h) => lower(c).includes(h))),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getUniqueValues — top 50 distinct values for a column (filter dropdowns)
// ─────────────────────────────────────────────────────────────────────────────

function getUniqueValues(rows: RowRecord[], col: string): string[] {
  const seen = new Set<string>();
  for (const r of rows) {
    const v = String(r[col] ?? "").trim();
    if (v) seen.add(v);
    if (seen.size >= 50) break;
  }
  return Array.from(seen).sort();
}

// ─────────────────────────────────────────────────────────────────────────────
// AnalystEditPanel — axis remapping + type override per chart
// ─────────────────────────────────────────────────────────────────────────────

function AnalystEditPanel({
  chart,
  overrides,
  columns,
  numericCols,
  dimensionCols,
  onUpdate,
  onClose,
}: {
  chart: DashboardChart;
  overrides: ChartOverride;
  columns: string[];
  numericCols: string[];
  dimensionCols: string[];
  onUpdate: (o: ChartOverride) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<ChartOverride>(overrides);

  const CHART_TYPES: { type: ChartType; label: string }[] = [
    { type: "area",      label: "Area"       },
    { type: "bar",       label: "Bar"        },
    { type: "line",      label: "Line"       },
    { type: "pie",       label: "Donut"      },
    { type: "histogram", label: "Histogram"  },
    { type: "composed",  label: "Composed"   },
    { type: "stackedBar",label: "Stacked Bar"},
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ duration: 0.2 }}
      className="absolute right-0 top-0 z-20 w-64 rounded-xl border border-slate-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5 text-slate-400" />
          <p className="text-xs font-semibold text-slate-700">Edit Chart</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-4">
        {/* Chart Type */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Chart Type
          </p>
          <Select
            value={local.type ?? chart.type}
            onValueChange={(v) => setLocal((p) => ({ ...p, type: v as ChartType }))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHART_TYPES.map(({ type, label }) => (
                <SelectItem key={type} value={type} className="text-xs">{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* X-Axis (Dimension) */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            X-Axis (Dimension)
          </p>
          <Select
            value={local.xAxis ?? ""}
            onValueChange={(v) => setLocal((p) => ({ ...p, xAxis: v }))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="text-xs">Auto</SelectItem>
              {dimensionCols.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Y-Axis (Metric) */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Y-Axis (Metric)
          </p>
          <Select
            value={local.yAxis ?? ""}
            onValueChange={(v) => setLocal((p) => ({ ...p, yAxis: v }))}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Auto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="text-xs">Auto</SelectItem>
              {numericCols.map((c) => (
                <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Apply */}
        <button
          onClick={() => { onUpdate(local); onClose(); }}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 active:scale-95"
        >
          Apply Changes
        </button>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FilterSidebar — date / category / region global filters
// ─────────────────────────────────────────────────────────────────────────────

function FilterSidebar({
  columns,
  rows,
  filters,
  onChange,
  onReset,
  onClose,
}: {
  columns: string[];
  rows: RowRecord[];
  filters: FilterState;
  onChange: (f: Partial<FilterState>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { dateCols, categoryCols, regionCols } = useMemo(
    () => detectFilterColumns(columns),
    [columns]
  );

  const categoryValues = useMemo(
    () => (filters.categoryColumn ? getUniqueValues(rows, filters.categoryColumn) : []),
    [rows, filters.categoryColumn]
  );
  const regionValues = useMemo(
    () => (filters.regionColumn ? getUniqueValues(rows, filters.regionColumn) : []),
    [rows, filters.regionColumn]
  );

  return (
    <motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.22 }}
      className="w-72 shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm overflow-y-auto max-h-[calc(100vh-12rem)] sticky top-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-slate-400" />
          <p className="text-sm font-semibold text-slate-700">Strategy Filters</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onReset}
            title="Reset filters"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-5 p-4">

        {/* ── Date Range ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Date Range
            </p>
          </div>
          {dateCols.length > 0 ? (
            <div className="space-y-2.5">
              <Select
                value={filters.dateColumn || ""}
                onValueChange={(v) => onChange({ dateColumn: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select date column…" />
                </SelectTrigger>
                <SelectContent>
                  {dateCols.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-[10px] text-slate-400">From</p>
                  <input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => onChange({ dateFrom: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <div>
                  <p className="mb-1 text-[10px] text-slate-400">To</p>
                  <input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => onChange({ dateTo: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs italic text-slate-300">No date columns detected</p>
          )}
        </section>

        {/* ── Category ────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Category
            </p>
          </div>
          {categoryCols.length > 0 ? (
            <div className="space-y-2.5">
              <Select
                value={filters.categoryColumn || ""}
                onValueChange={(v) => onChange({ categoryColumn: v, categoryValue: "" })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select category column…" />
                </SelectTrigger>
                <SelectContent>
                  {categoryCols.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filters.categoryColumn && (
                <Select
                  value={filters.categoryValue || "__all__"}
                  onValueChange={(v) => onChange({ categoryValue: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All values" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__" className="text-xs">All values</SelectItem>
                    {categoryValues.map((v) => (
                      <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <p className="text-xs italic text-slate-300">No category columns detected</p>
          )}
        </section>

        {/* ── Region ──────────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center gap-1.5 mb-3">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Region
            </p>
          </div>
          {regionCols.length > 0 ? (
            <div className="space-y-2.5">
              <Select
                value={filters.regionColumn || ""}
                onValueChange={(v) => onChange({ regionColumn: v, regionValue: "" })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select region column…" />
                </SelectTrigger>
                <SelectContent>
                  {regionCols.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {filters.regionColumn && (
                <Select
                  value={filters.regionValue || "__all__"}
                  onValueChange={(v) => onChange({ regionValue: v })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="All values" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__" className="text-xs">All values</SelectItem>
                    {regionValues.map((v) => (
                      <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <p className="text-xs italic text-slate-300">No region columns detected</p>
          )}
        </section>

        {/* Active filter summary */}
        {(filters.dateFrom || filters.dateTo || (filters.categoryValue && filters.categoryValue !== "__all__") || (filters.regionValue && filters.regionValue !== "__all__")) && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-blue-600 mb-1">Active filters</p>
            <div className="space-y-0.5 text-xs text-blue-700">
              {(filters.dateFrom || filters.dateTo) && (
                <p>Date: {filters.dateFrom || "…"} → {filters.dateTo || "…"}</p>
              )}
              {filters.categoryValue && filters.categoryValue !== "__all__" && (
                <p>{filters.categoryColumn}: {filters.categoryValue}</p>
              )}
              {filters.regionValue && filters.regionValue !== "__all__" && (
                <p>{filters.regionColumn}: {filters.regionValue}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: FilterState = {
  dateColumn: "", dateFrom: "", dateTo: "",
  categoryColumn: "", categoryValue: "",
  regionColumn: "", regionValue: "",
};

export default function VisualDashboardView() {
  const nav = useNavigate();
  const { dataset, schema, dashboard } = useDatasetStore();

  // ── Filter state ──────────────────────────────────────────────────────────
  const [filters,     setFilters]     = useState<FilterState>(EMPTY_FILTERS);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const updateFilter = useCallback((patch: Partial<FilterState>) => {
    setFilters((f) => ({ ...f, ...patch }));
  }, []);

  // ── Analyst edit mode ─────────────────────────────────────────────────────
  // overrides: per-chart axis/type customisations
  // editingId: which chart's edit panel is open
  const [overrides,  setOverrides]  = useState<Record<string, ChartOverride>>({});
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editMode,   setEditMode]   = useState(false);

  const updateOverride = useCallback((chartId: string, o: ChartOverride) => {
    setOverrides((prev) => {
      const next = { ...prev, [chartId]: o };
      // Persist typed ChartOverrideMap directly — no JSON.stringify
      const cur = datasetStore.get().dashboard;
      datasetStore.set({
        dashboard: {
          metric:         cur?.metric         ?? null,
          segment:        cur?.segment        ?? null,
          time:           cur?.time           ?? null,
          kpis:           cur?.kpis           ?? [],
          charts:         cur?.charts         ?? [],
          generatedAt:    Date.now(),
          activeTemplate: next,             // ChartOverrideMap, not string
          pinnedChartIds: cur?.pinnedChartIds ?? [],
          audit:          cur?.audit         ?? undefined,
        },
      });
      return next;
    });
  }, []);

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filteredRows = useMemo<RowRecord[]>(() => {
    const rows = (dataset?.rows ?? []) as RowRecord[];
    return applyFilters(rows, filters);
  }, [dataset?.rows, filters]);

  // ── Column classification for edit panels ─────────────────────────────────
  const columns = dataset?.columns ?? [];
  const { numericCols, dimensionCols } = useMemo(() => {
    const numericHints  = ["amount", "sales", "revenue", "value", "total", "qty", "quantity", "price", "cost", "margin", "profit", "debit", "credit"];
    const lower = (c: string) => c.toLowerCase();
    const numeric  = columns.filter((c) => numericHints.some((h) => lower(c).includes(h)));
    const dimension = columns.filter((c) => !numeric.includes(c));
    return { numericCols: numeric, dimensionCols: dimension };
  }, [columns]);

  // ── Strategy ──────────────────────────────────────────────────────────────
  const strategy = useMemo<VisualStrategy | null>(() => {
    if (!columns.length) return null;
    const storeAudit = dashboard?.audit;
    const auditInput: DataAudit | null = storeAudit
      ? {
          detectedPattern:   storeAudit.detectedPattern,
          recommendedCharts: storeAudit.recommendedCharts,
          reasoning:         storeAudit.reasoning,
          source:            storeAudit.source,
        }
      : null;

    return getTemplateStrategy(
      "auto",
      columns,
      filteredRows,
      schema ?? null,
      auditInput,
      dashboard?.pinnedChartIds ?? []
    );
  }, [columns, filteredRows, schema, dashboard?.audit, dashboard?.pinnedChartIds]);

  // ── AI insight ────────────────────────────────────────────────────────────
  const { aiResult, aiLoading } = useLocalAiInsight(strategy);

  // ── Pinning ───────────────────────────────────────────────────────────────
  const pinnedIds = useMemo(
    () => dashboard?.pinnedChartIds ?? strategy?.pinnedChartIds ?? [],
    [dashboard?.pinnedChartIds, strategy?.pinnedChartIds]
  );

  const togglePin = useCallback((id: string) => {
    const cur     = datasetStore.get().dashboard;
    const pinned  = cur?.pinnedChartIds ?? [];
    const next    = pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id];
    datasetStore.set({
      dashboard: {
        metric:      cur?.metric      ?? null,
        segment:     cur?.segment     ?? null,
        time:        cur?.time        ?? null,
        kpis:        cur?.kpis        ?? [],
        charts:      cur?.charts      ?? [],
        generatedAt: Date.now(),
        activeTemplate: cur?.activeTemplate ?? null,
        pinnedChartIds: next,
        audit:       cur?.audit ?? undefined,
      },
    });
  }, []);

  // ── Charts ────────────────────────────────────────────────────────────────
  const mergedCharts = useMemo<DashboardChart[]>(
    () => (strategy?.charts ?? []),
    [strategy]
  );

  // ── Drill modal ───────────────────────────────────────────────────────────
  const [drillChart, setDrillChart] = useState<DashboardChart | null>(null);

  // ── Audit status ──────────────────────────────────────────────────────────
  const isDualAIActive =
    !!dashboard?.audit &&
    (dashboard.audit.source === "merged" ||
     dashboard.audit.source === "gemini-only" ||
     dashboard.audit.source === "openrouter-only");
  const auditSource = dashboard?.audit?.source ?? "heuristic";

  // ── Board pack export ─────────────────────────────────────────────────────
  const handleBoardPackExport = useCallback(() => {
    if (!pinnedIds.length || !strategy) return;
    pinnedIds.forEach((id: string | number) => {
      const chart = mergedCharts.find((c) => c.id === id);
      if (!chart) return;
      exportChartCsv(chart, strategy.transformedData[id] ?? []);
    });
    toast.success("Board Pack exported", {
      description: `${pinnedIds.length} chart${pinnedIds.length > 1 ? "s" : ""} exported as CSV.`,
    });
  }, [pinnedIds, strategy, mergedCharts]);

  // ── Active filter count ────────────────────────────────────────────────────
  const activeFilterCount = [
    filters.dateFrom || filters.dateTo,
    filters.categoryValue && filters.categoryValue !== "__all__",
    filters.regionValue   && filters.regionValue   !== "__all__",
  ].filter(Boolean).length;

  // ─────────────────────────────────────────────────────────────────────────
  // Empty state
  // ─────────────────────────────────────────────────────────────────────────

  if (!dataset) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 font-sans">
        <Card className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
              <BarChart2 className="h-5 w-5 text-slate-400" />
            </div>
            <CardTitle className="text-lg font-semibold text-slate-900">No dataset loaded</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-2 pb-6">
            <Button variant="outline" size="sm" onClick={() => nav("/app/schema")}>
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Schema
            </Button>
            <Button size="sm" className="bg-slate-900 text-white hover:bg-slate-800" onClick={() => nav("/app/upload")}>
              Upload Data <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <div className="mx-auto max-w-[1440px] px-6 py-8">

        {/* ════════════════════════════════════════════════════════
            ① PAGE HEADER
        ════════════════════════════════════════════════════════ */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">
              AutoAnalyst · Step 4 of 6
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">
              Visual Dashboard
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
              Charts generated instantly from rule engine. AI insights stream in after.
            </p>

            {/* Status badges */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {dataset.meta?.name ?? "dataset"}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {(filteredRows.length).toLocaleString()} rows · {columns.length} cols
                {filteredRows.length !== (dataset.meta?.rows ?? dataset.rows?.length ?? 0) && (
                  <span className="ml-1 text-amber-600">(filtered)</span>
                )}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {mergedCharts.length} charts
              </Badge>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                Rules fired
              </span>
              {dashboard?.audit && (
                <AIInsightBadge audit={dashboard.audit as StoredAudit} />
              )}
              {aiLoading && !aiResult && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  AI reasoning…
                </span>
              )}
              {activeFilterCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                  <Filter className="h-3 w-3" />
                  {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""} active
                </span>
              )}
            </div>
          </div>

          {/* ── TOP-RIGHT NAV (locked) ──────────────────────────────── */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Analyst edit mode toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditMode((e) => !e)}
              className={editMode ? "border-[#2185fb] bg-blue-50 text-[#2185fb]" : ""}
            >
              <Settings2 className="mr-1.5 h-3.5 w-3.5" />
              {editMode ? "Exit Edit Mode" : "Analyst Mode"}
            </Button>

            {/* Strategy filter sidebar toggle */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSidebarOpen((s) => !s)}
              className={sidebarOpen ? "border-[#2185fb] bg-blue-50 text-[#2185fb]" : ""}
            >
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>

            <Button variant="outline" size="sm" onClick={() => nav("/app/schema")}>
              Back
            </Button>
            <Button
              size="sm"
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => nav("/app/health")}
            >
              Next Health
            </Button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            ② AI REASONING PANEL
        ════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {(isDualAIActive || aiResult) && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-6 rounded-xl border border-blue-100 bg-blue-50 px-5 py-4"
            >
              <div className="flex flex-wrap items-start gap-3">
                <Brain className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-blue-600">
                    {isDualAIActive
                      ? `Dual-audit · ${auditSource}${dashboard?.audit?.primarySignals?.length ? ` · Signals: ${dashboard.audit.primarySignals.slice(0, 3).join(", ")}` : ""}`
                      : "Heuristic Strategy Engine"}
                  </p>
                  {isDualAIActive && dashboard?.audit?.reasoning && (
                    <p className="mt-1 text-sm leading-relaxed text-blue-800">
                      {dashboard.audit.reasoning}
                    </p>
                  )}
                  {aiResult && aiResult.source === "heuristic-only" && (
                    <p className="mt-1 text-sm leading-relaxed text-blue-700">
                      {aiResult.dashboardReasoning}
                    </p>
                  )}
                </div>
                {isDualAIActive && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                    <Sparkles className="h-3 w-3" />
                    {auditSource}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main content: sidebar + chart area */}
        <div className="flex gap-6">

          {/* ════════════════════════════════════════════════════════
              ⑦ STRATEGY FILTER SIDEBAR
          ════════════════════════════════════════════════════════ */}
          <AnimatePresence>
            {sidebarOpen && (
              <FilterSidebar
                columns={columns}
                rows={(dataset.rows ?? []) as RowRecord[]}
                filters={filters}
                onChange={updateFilter}
                onReset={() => setFilters(EMPTY_FILTERS)}
                onClose={() => setSidebarOpen(false)}
              />
            )}
          </AnimatePresence>

          {/* Right: KPI + charts */}
          <div className="min-w-0 flex-1 space-y-6">

            {/* ════════════════════════════════════════════════════
                ③ KPI RIBBON — grey #f3f4f6 command bar
            ════════════════════════════════════════════════════ */}
            {strategy && strategy.kpis.length > 0 && (
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Key Performance Indicators
                </p>
                <KpiRibbon kpis={strategy.kpis} />
              </div>
            )}

            {/* ════════════════════════════════════════════════════
                ④ BOARD PACK BANNER
            ════════════════════════════════════════════════════ */}
            {pinnedIds.length > 0 && (
              <BoardPackBanner pinnedIds={pinnedIds} onExport={handleBoardPackExport} />
            )}

            {/* ════════════════════════════════════════════════════
                ⑤ CHART GRID  +  ⑥ ANALYST EDIT MODE
            ════════════════════════════════════════════════════ */}
            {strategy ? (
              <>
                {/* Analyst edit mode banner */}
                {editMode && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"
                  >
                    <Settings2 className="h-4 w-4 text-[#2185fb] shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-blue-700">Analyst Edit Mode</p>
                      <p className="text-xs text-blue-500">
                        Click the chart type pill on any card to remap axes or change chart type. Overrides are saved automatically.
                      </p>
                    </div>
                    <button
                      onClick={() => setEditMode(false)}
                      className="ml-auto text-blue-400 hover:text-blue-700 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.div>
                )}

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {mergedCharts.map((chart) => {
                    const data     = strategy.transformedData[chart.id] ?? [];
                    const override = overrides[chart.id] ?? {};

                    return (
                      <div key={chart.id} className="relative">
                        <ChartCard
                          chart={chart}
                          data={data}
                          isPinned={pinnedIds.includes(chart.id)}
                          onPin={() => togglePin(chart.id)}
                          onDrill={() => setDrillChart(chart)}
                          onExport={() => exportChartCsv(chart, data)}
                          overrideType={override.type}
                          onTypeChange={editMode
                            ? (type: ChartType) => {
                                updateOverride(chart.id, { ...override, type });
                                toast.success("Chart type updated", { description: chart.title });
                              }
                            : undefined
                          }
                        />

                        {/* Analyst Edit Panel (appears when editMode + chart type pill clicked) */}
                        <AnimatePresence>
                          {editMode && editingId === chart.id && (
                            <AnalystEditPanel
                              chart={chart}
                              overrides={override}
                              columns={columns}
                              numericCols={numericCols}
                              dimensionCols={dimensionCols}
                              onUpdate={(o) => {
                                updateOverride(chart.id, o);
                                toast.success("Chart overrides saved", { description: chart.title });
                              }}
                              onClose={() => setEditingId(null)}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Building visual strategy…
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          ⑧ DRILL MODAL
      ════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {drillChart && (
          <DrillModal
            chart={drillChart}
            data={strategy?.transformedData[drillChart.id] ?? []}
            onClose={() => setDrillChart(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}