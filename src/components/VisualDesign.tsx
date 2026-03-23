// ─────────────────────────────────────────────────────────────────────────────
// VisualDesign.tsx  —  AutoAnalyst Growth Intelligence Component Library
//
// THE rule: all Recharts configuration lives here and NOWHERE else.
// VisualDashboardView.tsx is an import-only consumer of this file.
//
// Exports:
//   <ChartRenderer />       Recharts switcher: area / bar / line / pie / composed / histogram
//   <ChartCard />           Card shell: header + action menu + chart + AI badge
//   <KPIBlock />            Single KPI tile with trend indicator
//   <KpiRibbon />           Grey command bar (#f3f4f6) housing KPI blocks
//   <AIInsightBadge />      Expandable blue-tinted reasoning banner
//   <BoardPackBanner />     Pinned count strip + export button
//   <DrillModal />          Full-screen drill-down overlay
//   <TrendIndicator />      Emerald / Rose arrow chip
//   PALETTE                 Canonical 6-colour enterprise array
//
// Design system:
//   bg-slate-50  |  cards: bg-white border-slate-200 shadow-sm rounded-xl
//   Charts: radius={0} sharp-edge Power BI aesthetic
//   Palette: ["#2185fb","#111892","#e8702a","#de429b","#5c007a","#7cb5ec"]
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  BarChart2,
  ChevronDown,
  ChevronUp,
  Download,
  Maximize2,
  MoreVertical,
  Pin,
  PinOff,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── Types from their canonical sources ────────────────────────────────────────
// Imported AND re-exported so consumers can import everything from VisualDesign
// without creating a second import line for visualstrategies or DatasetStore.
// This ensures ChartType identity is identical across all callers — no
// "ChartType from visualstrategies" vs "ChartType from VisualDesign" mismatch.
import type {
  ChartPoint,
  ChartType,
  DashboardChart,
  DashboardKpi,
} from "@/lib/visualstrategies";
import type { StoredAudit } from "@/lib_old/DatasetStore";

export type { ChartPoint, ChartType, DashboardChart, DashboardKpi, StoredAudit };

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────────────────────────────────────

export const PALETTE = [
  "#2185fb",
  "#111892",
  "#e8702a",
  "#de429b",
  "#5c007a",
  "#7cb5ec",
] as const;

const TICK = { fontSize: 11, fill: "#94a3b8", fontFamily: "inherit" };
const GRID = { stroke: "#f1f5f9", strokeDasharray: "4 2" } as const;
const MARGINS = { top: 8, right: 16, left: 4, bottom: 24 } as const;

const COMPACT = (v: number) => {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000)       return `${(v / 1_000).toFixed(0)}K`;
  return String(v);
};

// ─────────────────────────────────────────────────────────────────────────────
// Custom Tooltip
// ─────────────────────────────────────────────────────────────────────────────

function GITooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg text-xs">
      {label && <p className="mb-1.5 font-semibold text-slate-500 truncate max-w-[180px]">{label}</p>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-slate-700">
          <span
            className="h-2 w-2 rounded-sm shrink-0"
            style={{ background: p.color ?? p.fill ?? PALETTE[i % PALETTE.length] }}
          />
          {p.name && <span className="text-slate-400">{p.name}:</span>}
          <span className="ml-auto font-semibold text-slate-900 tabular-nums">
            {typeof p.value === "number" ? p.value.toLocaleString("en-IN") : String(p.value ?? "—")}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty chart state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyViz({ height = 220 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60"
      style={{ height }}
    >
      <p className="text-xs italic text-slate-300">Not enough data to render this visual.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Donut active shape
// ─────────────────────────────────────────────────────────────────────────────

function ActiveDonutShape(props: any) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, value, index } = props;
  return (
    <g>
      <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 6}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <Sector cx={cx} cy={cy} innerRadius={outerRadius + 8} outerRadius={outerRadius + 10}
        startAngle={startAngle} endAngle={endAngle} fill={fill} />
      <text x={cx} y={cy - 8} textAnchor="middle" fill="#0f172a" fontSize={12} fontWeight={600} fontFamily="inherit">
        {payload.label?.length > 16 ? `${payload.label.slice(0, 16)}…` : payload.label}
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill="#64748b" fontSize={11} fontFamily="inherit">
        {Number(value).toLocaleString("en-IN")}
      </text>
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChartRenderer — the core Recharts switcher
// ─────────────────────────────────────────────────────────────────────────────

export function ChartRenderer({
  chart,
  data,
  height = 220,
  overrideType,
}: {
  chart: DashboardChart;
  data: ChartPoint[];
  height?: number;
  overrideType?: ChartType;
}) {
  const [activeDonutIdx, setActiveDonutIdx] = useState(0);

  if (!data.length) return <EmptyViz height={height} />;

  const type = overrideType ?? chart.type;
  const hasSec = data.some((d) => d.secondaryValue !== undefined);

  // Dynamic YAxis width based on longest label
  const longestLabel = Math.max(...data.map((d) => String(d.label).length));
  const yWidth = Math.min(Math.max(48, longestLabel * 6), 100);

  // Area / Line
  if (type === "area" || type === "line") {
    const ChartComp = type === "area" ? AreaChart : LineChart;
    const SeriesComp = type === "area" ? Area : Line;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ChartComp data={data} margin={MARGINS}>
          {type === "area" && (
            <defs>
              <linearGradient id={`ag-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={PALETTE[0]} stopOpacity={0.2} />
                <stop offset="95%" stopColor={PALETTE[0]} stopOpacity={0}   />
              </linearGradient>
              {hasSec && (
                <linearGradient id={`ag2-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={PALETTE[2]} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={PALETTE[2]} stopOpacity={0}    />
                </linearGradient>
              )}
            </defs>
          )}
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false}
            interval="preserveStartEnd" angle={-15} textAnchor="end" height={36} />
          <YAxis tick={TICK} axisLine={false} tickLine={false}
            width={yWidth} tickFormatter={COMPACT} />
          <Tooltip content={<GITooltip />} />
          <SeriesComp
            type="monotone" dataKey="value" name="Value"
            stroke={PALETTE[0]} strokeWidth={2.5} dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
            {...(type === "area" ? { fill: `url(#ag-${chart.id})` } : {})}
          />
          {hasSec && (
            <SeriesComp
              type="monotone" dataKey="secondaryValue" name="Secondary"
              stroke={PALETTE[2]} strokeWidth={2} dot={false}
              strokeDasharray={type === "line" ? "5 3" : undefined}
              {...(type === "area" ? { fill: `url(#ag2-${chart.id})` } : {})}
            />
          )}
        </ChartComp>
      </ResponsiveContainer>
    );
  }

  // Horizontal ranked bar (default "bar")
  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid {...GRID} horizontal={false} />
          <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={COMPACT} />
          <YAxis type="category" dataKey="label" width={Math.min(Math.max(70, longestLabel * 6), 140)}
            tick={{ ...TICK, textAnchor: "end" }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip content={<GITooltip />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="value" radius={0} maxBarSize={22} name="Value">
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Stacked bar
  if (type === "stackedBar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={MARGINS}>
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false}
            interval="preserveStartEnd" angle={-15} textAnchor="end" height={36} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={yWidth} tickFormatter={COMPACT} />
          <Tooltip content={<GITooltip />} />
          <Bar dataKey="value" stackId="a" radius={0} fill={PALETTE[0]} name="Value" />
          {hasSec && <Bar dataKey="secondaryValue" stackId="a" radius={0} fill={PALETTE[2]} name="Secondary" />}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Pie / Donut
  if (type === "pie") {
    const R = Math.round(height * 0.38);
    const r = Math.round(height * 0.22);
    const renderActiveShape = (props: any) => {
      if (props.index !== activeDonutIdx) return <Sector {...props} />;
      return <ActiveDonutShape {...props} />;
    };
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Tooltip content={<GITooltip />} />
          <Pie
            data={data} dataKey="value" nameKey="label"
            cx="50%" cy="50%"
            innerRadius={r} outerRadius={R} paddingAngle={2}
            activeShape={renderActiveShape}
            onMouseEnter={(_: any, index: number) => setActiveDonutIdx(index)}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  // Histogram (vertical bars, frequency distribution)
  if (type === "histogram") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={MARGINS}>
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis dataKey="label" tick={{ ...TICK, fontSize: 10 }} axisLine={false} tickLine={false}
            interval={0} angle={-20} textAnchor="end" height={40} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<GITooltip />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="value" radius={0} name="Frequency" maxBarSize={32}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[0]} opacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // Composed (bars + line — cashflow / dual-metric)
  if (type === "composed") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={MARGINS}>
          <CartesianGrid {...GRID} vertical={false} />
          <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false}
            interval="preserveStartEnd" angle={-15} textAnchor="end" height={36} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} width={yWidth} tickFormatter={COMPACT} />
          <Tooltip content={<GITooltip />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="value" fill={PALETTE[0]} radius={0} name="Volume" maxBarSize={14} />
          {hasSec && (
            <Line type="monotone" dataKey="secondaryValue" stroke={PALETTE[2]}
              strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} name="Net" />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return <EmptyViz height={height} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// TrendIndicator — Emerald (up) / Rose (down) arrow chip
// ─────────────────────────────────────────────────────────────────────────────

export function TrendIndicator({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  const isUp = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        isUp
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-rose-50 text-rose-700 border border-rose-200"
      }`}
    >
      {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isUp ? "+" : ""}{value.toFixed(1)}%{label ? ` ${label}` : ""}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPIBlock — single metric tile with large value + trend
// ─────────────────────────────────────────────────────────────────────────────

export function KPIBlock({
  label,
  value,
  trend,
  trendLabel,
}: {
  label: string;
  value: string;
  trend?: number;
  trendLabel?: string;
}) {
  return (
    <div className="flex min-w-[120px] flex-col gap-2 text-center">
      <p className="text-[2rem] font-extrabold leading-none tracking-tight text-black tabular-nums">
        {value}
      </p>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
        {label}
      </p>
      {trend !== undefined && (
        <div className="flex justify-center">
          <TrendIndicator value={trend} label={trendLabel} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KpiRibbon — grey #f3f4f6 command bar
// Accepts DashboardKpi[] directly from strategy.kpis
// ─────────────────────────────────────────────────────────────────────────────

export function KpiRibbon({ kpis }: { kpis: DashboardKpi[] }) {
  if (!kpis.length) return null;
  return (
    <div className="flex flex-wrap items-center justify-around gap-5 rounded-xl border border-[#d8d8d8] bg-[#f3f4f6] px-8 py-6 shadow-sm">
      {kpis.map((kpi) => (
        <KPIBlock key={kpi.id} label={kpi.label} value={String(kpi.value ?? "—")} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AIInsightBadge — expandable blue-tinted reasoning banner
// Accepts either { audit: StoredAudit } or { text: string; source?: string }
// AIInsightBadgeProps is exported so callers can narrow the union explicitly.
// ─────────────────────────────────────────────────────────────────────────────

export type AIInsightBadgeProps =
  | { audit: StoredAudit; text?: never; source?: never; loading?: boolean }
  | { text: string | null; source?: string; audit?: never; loading?: boolean };

export function AIInsightBadge(props: AIInsightBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  // Resolve text and source from either prop shape
  let text: string | null = null;
  let source = "heuristic";
  let isLoading = props.loading ?? false;

  if ("audit" in props && props.audit) {
    text   = props.audit.reasoning ?? null;
    source = props.audit.source    ?? "heuristic";
  } else if ("text" in props) {
    text   = props.text ?? null;
    source = props.source ?? "heuristic";
  }

  const isAI = source !== "heuristic";

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
        <div className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-slate-600" />
        <p className="text-xs text-slate-400">AI reasoning loading…</p>
      </div>
    );
  }

  if (!text) return null;

  const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
  const needsExpand = text.length > 120;

  return (
    <motion.div
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className={`rounded-lg border px-3 py-2.5 ${
        isAI ? "border-blue-100 bg-blue-50" : "border-slate-100 bg-slate-50/80"
      }`}
    >
      <div className="flex items-start gap-2">
        <Sparkles className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${isAI ? "text-[#2185fb]" : "text-slate-400"}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`text-[10px] font-semibold uppercase tracking-wider ${isAI ? "text-blue-600" : "text-slate-400"}`}>
              {isAI ? `AI Insight · ${source}` : "Heuristic Insight"}
            </p>
          </div>
          <p className={`text-xs leading-relaxed ${isAI ? "text-blue-800" : "text-slate-600"}`}>
            {expanded ? text : preview}
          </p>
          {needsExpand && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className={`mt-1 flex items-center gap-1 text-[11px] font-medium ${isAI ? "text-blue-600 hover:text-blue-800" : "text-slate-500 hover:text-slate-700"}`}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ChartCard — enterprise card shell
// Accepts { chart, data, isPinned, onPin, onDrill, onExport }
// Includes: title, chart-type icon, action menu, ChartRenderer, AI badge
// ─────────────────────────────────────────────────────────────────────────────

export type ChartCardProps = {
  chart: DashboardChart;
  data: ChartPoint[];
  isPinned: boolean;
  onPin: () => void;
  onDrill: () => void;
  onExport: () => void;
  // Analyst edit mode overrides
  overrideType?: ChartType;
  onTypeChange?: (type: ChartType) => void;
};

const CHART_TYPES: { type: ChartType; label: string }[] = [
  { type: "area",       label: "Area"       },
  { type: "bar",        label: "Bar"        },
  { type: "line",       label: "Line"       },
  { type: "pie",        label: "Donut"      },
  { type: "histogram",  label: "Histogram"  },
  { type: "composed",   label: "Composed"   },
  { type: "stackedBar", label: "Stacked Bar"},
];

export function ChartCard({
  chart,
  data,
  isPinned,
  onPin,
  onDrill,
  onExport,
  overrideType,
  onTypeChange,
}: ChartCardProps) {
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [typeOpen,  setTypeOpen]  = useState(false);
  const menuRef   = useRef<HTMLDivElement>(null);
  const typeRef   = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (typeRef.current && !typeRef.current.contains(e.target as Node)) setTypeOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const displayType = overrideType ?? chart.type;
  const hasAnomaly  = !!chart.hasAnomaly;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`group flex flex-col rounded-xl border bg-white shadow-sm transition-all duration-200 ${
        isPinned
          ? "border-[#2185fb] ring-2 ring-[#2185fb]/20 shadow-md"
          : "border-slate-200 hover:shadow-md hover:border-slate-300"
      }`}
    >
      {/* ── Card Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          {/* Chart type pill */}
          <div className="mb-1.5" ref={typeRef}>
            <button
              onClick={() => setTypeOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition hover:border-slate-300 hover:bg-white"
            >
              <BarChart2 className="h-3 w-3" />
              {displayType}
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
            <AnimatePresence>
              {typeOpen && onTypeChange && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0,  scale: 1    }}
                  exit={{   opacity: 0, y: -4, scale: 0.97  }}
                  transition={{ duration: 0.12 }}
                  className="absolute z-30 mt-1 w-32 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
                >
                  <div className="py-1">
                    {CHART_TYPES.map(({ type, label }) => (
                      <button
                        key={type}
                        onClick={() => { onTypeChange(type); setTypeOpen(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition ${
                          displayType === type
                            ? "bg-slate-900 font-semibold text-white"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <h3 className="text-[14px] font-semibold leading-snug text-slate-900">
            {chart.title}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400 leading-relaxed line-clamp-2">
            {chart.description}
          </p>

          {/* Anomaly badge */}
          {hasAnomaly && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              Spike · {chart.anomalyPeak !== undefined ? chart.anomalyPeak.toLocaleString("en-IN") : "detected"}
            </span>
          )}
        </div>

        {/* Action menu */}
        <div className="flex shrink-0 items-center gap-1 relative" ref={menuRef}>
          {/* Pin button — always visible */}
          <button
            onClick={onPin}
            title={isPinned ? "Unpin" : "Pin to board"}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
              isPinned
                ? "border-[#2185fb] bg-[#2185fb] text-white"
                : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"
            }`}
          >
            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>

          {/* Expand */}
          <button
            onClick={onDrill}
            title="Expand"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>

          {/* ⋮ Menu */}
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:text-slate-600"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1,   y: 0  }}
                exit={{   opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-8 z-20 w-36 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
              >
                <div className="py-1">
                  {[
                    { icon: <Download className="h-3.5 w-3.5" />, label: "Export CSV", action: onExport },
                    { icon: <Maximize2 className="h-3.5 w-3.5" />, label: "Drill-down",  action: onDrill  },
                  ].map(({ icon, label, action }) => (
                    <button
                      key={label}
                      onClick={() => { action(); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs text-slate-600 transition hover:bg-slate-50"
                    >
                      {icon}
                      {label}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Chart body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 px-3 py-4">
        <ChartRenderer chart={chart} data={data} overrideType={overrideType} />
      </div>

      {/* ── AI Reasoning footer ─────────────────────────────────────────────── */}
      {chart.reasoning && (
        <div className="border-t border-slate-100 px-4 py-3">
          <AIInsightBadge text={chart.reasoning} source="heuristic" />
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BoardPackBanner — pinned count strip + export button
// ─────────────────────────────────────────────────────────────────────────────

export function BoardPackBanner({
  pinnedIds,
  onExport,
}: {
  pinnedIds: string[];
  onExport: () => void;
}) {
  if (!pinnedIds.length) return null;
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div className="flex items-center gap-2">
        <Pin className="h-4 w-4 text-[#2185fb]" />
        <span className="text-sm font-semibold text-slate-700">
          Board Pack — <span className="text-[#2185fb]">{pinnedIds.length} chart{pinnedIds.length !== 1 ? "s" : ""}</span> pinned
        </span>
      </div>
      <button
        onClick={onExport}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95"
      >
        <Download className="h-3.5 w-3.5" />
        Export Board Pack
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DrillModal — full-screen drill-down overlay
// ─────────────────────────────────────────────────────────────────────────────

export function DrillModal({
  chart,
  data,
  onClose,
}: {
  chart: DashboardChart;
  data: ChartPoint[];
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-4 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1,    opacity: 1, y: 0 }}
        exit={{   scale: 0.96, opacity: 0       }}
        transition={{ type: "spring", stiffness: 420, damping: 32 }}
        className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Drill-Down · {chart.type}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{chart.title}</h2>
            {chart.description && (
              <p className="mt-0.5 text-sm text-slate-500">{chart.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chart — larger height */}
        <div className="px-6 py-6">
          <ChartRenderer chart={chart} data={data} height={380} />
        </div>

        {/* AI Reasoning */}
        {chart.reasoning && (
          <div className="border-t border-slate-100 px-6 py-4">
            <AIInsightBadge text={chart.reasoning} source="heuristic" />
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-slate-100 px-6 py-3">
          <p className="text-xs text-slate-400">
            {data.length} data points · Hover elements for precise values · Press{" "}
            <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-mono">Esc</kbd>{" "}
            to close
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}