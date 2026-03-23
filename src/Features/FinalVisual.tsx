// ─────────────────────────────────────────────────────────────────────────────
// FinalReportView.tsx  —  AutoAnalyst Master Mirror  v5.0
//
// THE MIRROR PRINCIPLE: This file performs ZERO new analysis.
// Every value on this page is a pure read from datasetStore.
//
// Store reads:
//   dataset     → rows, columns, metadata for pipeline stats
//   dashboard   → kpis, pinnedChartIds, activeTemplate (axis overrides), audit
//   report      → aiSummary, nextMoves, alerts, score, marginPct, hoursSaved
//   schema      → column profiles for strategy mirror
//
// Component sync: all Recharts rendering delegated to VisualDesign.tsx.
//   ChartRenderer — routes to area/bar/line/pie/histogram/composed
//   AIInsightBadge — { text, source } per pinned chart card
//   KpiRibbon     — DashboardKpi[] from strategy mirror
//   ChartCard     — legacy shape { chart, data, onDrill, onExport, isPinned }
//   PALETTE, ChartType
//
// Customization sync: reads dashboard.activeTemplate (typed ChartOverrideMap)
//   and applies per-chart type and axis overrides through ChartRenderer's
//   overrideType prop — exactly mirroring what the analyst saved in Visual Dashboard.
//
// Sections:
//   ① Generating overlay (7-step progress bar, 270ms cadence)
//   ② Executive Hero (dark panel + aiSummary + animated Health Ring)
//   ③ KPI Command Bar (grey #f3f4f6 ribbon, board-metric values)
//   ④ Strategic Roadmap (numbered nextMoves, severity badges, timeline)
//   ⑤ Pinned Visual Gallery (2-col, AI insight badges, analyst overrides applied)
//   ⑥ Export + Sharing Sidebar (PNG, CSV, WhatsApp, Copy, Print)
//   ⑦ ICE Prioritization Table (derived from nextMoves + Margin/Hours live inputs)
//   ⑧ Audit Trail Footer (Rows/Cols, Timestamp, AI Provider, Watermark)
//
// Export:
//   html2canvas at 2.5× DPI on off-screen 1480px surface
//   Watermark: "Strategic Audit by AutoAnalyst | Confidential"
//   WhatsApp share uses wa.me web API with executive summary text
//   Copy Insight builds plaintext summary + nextMoves for clipboard
//
// Design:
//   max-w-[1440px] px-8 py-8 · gap-7 · rounded-2xl cards
//   bg-slate-50 · border-slate-200 · shadow-sm
//   Palette ["#2185fb","#111892","#e8702a","#de429b","#5c007a","#7cb5ec"]
//   radius=0 bars enforced in VisualDesign
//   No emojis. Lucide icons only.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import html2canvas from "html2canvas";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  History,
  Loader2,
  Lock,
  Mail,
  Pin,
  Printer,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";

// ── VisualDesign — zero Recharts in this file ─────────────────────────────────
import {
  AIInsightBadge,
  ChartRenderer,
  KpiRibbon,
  PALETTE,
  type AIInsightBadgeProps,
  type ChartPoint,
  type ChartType,
  type DashboardChart,
  type DashboardKpi,
} from "@/components/VisualDesign";
import type {
  TemplateId,
} from "@/lib/visualstrategies";

// ── Store & Strategy ──────────────────────────────────────────────────────────
import { useDatasetStore } from "@/lib_old/DatasetStore";
import { getTemplateStrategy } from "@/lib/visualstrategies";
import { useDualAudit } from "@/../hooks/UseDualAudit";

// ── UI ────────────────────────────────────────────────────────────────────────
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DatasetRecord = Record<string, unknown>;

type DatasetShape = {
  columns?: string[];
  rows?: DatasetRecord[];
  meta?: {
    name?: string;
    rows?: number;
    cols?: number;
    createdAt?: number;
    source?: string;
  };
} | null;

type NextMoveItem =
  | string
  | {
      title?: string;
      why?: string;
      impact?: number;
      confidence?: number;
      effort?: number;
    };

type ReportShape = {
  aiSummary?: string | null;
  nextMoves?: NextMoveItem[];
  alerts?: {
    title?: string;
    severity?: "high" | "med" | "low";
    detail?: string;
  }[];
  score?: number;
  marginPct?: string;
  hoursSaved?: string;
} | null;


type DashboardShape = {
  template?: TemplateId;
  kpis?: DashboardKpi[];
  charts?: DashboardChart[];
  pinnedChartIds?: string[];
  /** Typed ChartOverrideMap — set by VisualDashboardView, read here as an object (no JSON.parse) */
  activeTemplate?: Record<string, ChartOverride> | null;
  audit?: {
    reasoning?: string;
    source?: string;
    detectedPattern?: string;
    patternConfidence?: number;
    primarySignals?: string[];
  };
  generatedAt?: number;
} | null;

type SchemaShape = { columns?: unknown[] } | null;

// Per-chart axis/type override — mirrored from VisualDashboardView
type ChartOverride = {
  type?: ChartType;
  xAxis?: string;
  yAxis?: string;
};

type IceRow = {
  id: string;
  bet: string;
  impact: number;
  confidence: number;
  effort: number;
  score: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GENERATE_STEPS = [
  "Restoring analyst pipeline state…",
  "Resolving pinned chart references…",
  "Syncing analyst customization overrides…",
  "Composing KPI command bar from dataset…",
  "Generating executive brief…",
  "Building ICE prioritization table…",
  "Rendering board pack for export…",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pure utilities
// ─────────────────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

function fmtTimestamp(ts?: number): string {
  const d = ts ? new Date(ts) : new Date();
  return d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "").replace(/,/g, "").replace(/[^\d.\-]/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function estimateSalesBase(dataset: DatasetShape): number {
  const cols = dataset?.columns ?? [];
  const rows = dataset?.rows ?? [];
  const hints = ["sales", "amount", "revenue", "total", "credit", "debit", "balance", "net"];
  const col = hints.map((h) => cols.find((c) => c.toLowerCase().includes(h))).find(Boolean) ?? cols[0];
  if (!col) return 0;
  return rows.reduce((s, r) => s + (toNumber(r[col]) ?? 0), 0);
}

// ICE score formula — deterministic from nextMoves + ROI assumptions
function buildIceRows(moves: string[], marginPct: number, hoursSaved: number): IceRow[] {
  const seeds = moves.length
    ? moves
    : [
        "Re-run synced strategy visuals after cleanup",
        "Prioritize high-severity data quality issues",
        "Standardize export mapping for repeat uploads",
        "Launch board review with refreshed KPI set",
      ];
  return seeds.slice(0, 6).map((bet, i) => {
    const impact     = Math.min(10, Math.max(3, Math.round(marginPct / 5) + 2 + Math.max(0, 3 - i)));
    const confidence = Math.min(10, Math.max(4, Math.round(hoursSaved / 2) + 3 - Math.min(i, 2)));
    const effort     = Math.min(10, Math.max(2, 7 - Math.round(hoursSaved / 3) + i));
    return {
      id:    `ice-${i}`,
      bet,
      impact,
      confidence,
      effort,
      score: Number(((impact * confidence) / Math.max(1, effort)).toFixed(1)),
    };
  });
}

function healthTone(score?: number) {
  const s = score ?? 0;
  if (s >= 80) return { ring: "#10b981", bg: "#ecfdf5", badge: "border-emerald-200 bg-emerald-50 text-emerald-700", label: "Healthy" };
  if (s >= 50) return { ring: "#f59e0b", bg: "#fffbeb", badge: "border-amber-200 bg-amber-50 text-amber-700",        label: "Moderate Risk" };
  return           { ring: "#f43f5e", bg: "#fff1f2",  badge: "border-rose-200 bg-rose-50 text-rose-700",            label: "At Risk" };
}

function moveSeverity(i: number): { label: string; cls: string } {
  if (i < 2) return { label: "High",   cls: "border-rose-200 bg-rose-50 text-rose-700" };
  if (i < 4) return { label: "Medium", cls: "border-amber-200 bg-amber-50 text-amber-700" };
  return            { label: "Low",    cls: "border-emerald-200 bg-emerald-50 text-emerald-700" };
}

function downloadText(name: string, text: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function toCsv(cols: string[], rows: DatasetRecord[]) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes('"') || s.includes(",") ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return cols.map(esc).join(",") + "\n" +
    rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
}

// Resolve AI provider display name from audit source
function providerLabel(source?: string): string {
  if (!source || source === "heuristic") return "Offline Heuristics";
  if (source === "merged")            return "Gemini + DeepSeek R1";
  if (source === "gemini-only")       return "Gemini";
  if (source === "openrouter-only")   return "DeepSeek R1";
  if (source === "llm-bridge")        return "LLM Bridge";
  return source;
}

// ─────────────────────────────────────────────────────────────────────────────
// HealthRing — animated SVG donut (self-contained, no external deps)
// ─────────────────────────────────────────────────────────────────────────────

function HealthRing({ score, animated = false }: { score?: number; animated?: boolean }) {
  const pct  = Math.min(100, Math.max(0, score ?? 0));
  const tone = healthTone(pct);
  const R    = 52;
  const circ = 2 * Math.PI * R;
  const [shown, setShown] = useState(animated ? 0 : pct);

  useEffect(() => {
    if (!animated) { setShown(pct); return; }
    let frame = 0;
    const start = performance.now();
    const tick  = (now: number) => {
      const p = Math.min(1, (now - start) / 1050);
      setShown(Math.round(p * pct));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pct, animated]);

  const dash = (shown / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex items-center justify-center rounded-full"
        style={{ width: 136, height: 136, background: tone.bg }}>
        <svg width={136} height={136} viewBox="0 0 140 140">
          <circle cx={70} cy={70} r={R} fill="none" stroke="#e2e8f0" strokeWidth={12} />
          <circle cx={70} cy={70} r={R} fill="none"
            stroke={tone.ring} strokeWidth={12} strokeLinecap="butt"
            strokeDasharray={String(circ)}
            strokeDashoffset={circ - dash}
            transform="rotate(-90 70 70)"
            style={{ transition: animated ? "stroke-dashoffset 1.05s cubic-bezier(0.4,0,0.2,1)" : "none" }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <p className="text-[2.6rem] font-extrabold tabular-nums leading-none" style={{ color: tone.ring }}>{shown}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mt-0.5">/ 100</p>
        </div>
      </div>
      <div className="text-center">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${tone.badge}`}>
          {pct >= 80 ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {tone.label}
        </span>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Business Vitality Score</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PinnedChartCard — wraps ChartCard from VisualDesign with override application
// Reads the ChartOverride saved by VisualDashboardView and applies overrideType
// so the chart renders exactly as the analyst configured it.
// ─────────────────────────────────────────────────────────────────────────────

function PinnedChartCard({
  chart,
  data,
  override,
  isAIActive,
  isPinned,
}: {
  chart:      DashboardChart;
  data:       ChartPoint[];
  override:   ChartOverride;
  isAIActive: boolean;
  isPinned:   boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      {/* Card header + metadata above the ChartCard shell */}
      <div className="rounded-2xl border border-[#2185fb]/30 bg-white shadow-sm ring-2 ring-[#2185fb]/15 overflow-hidden">
        {/* Provenance header */}
        <div className="border-b border-slate-100 px-5 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                Pinned Visual · {chart.type}{override.type && override.type !== chart.type ? ` → ${override.type}` : ""}
              </p>
              <p className="text-[15px] font-semibold leading-snug text-slate-900">{chart.title}</p>
              <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{chart.description}</p>

              {/* Axis overrides applied badge */}
              {(override.xAxis || override.yAxis) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {override.xAxis && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      X: {override.xAxis}
                    </span>
                  )}
                  {override.yAxis && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                      Y: {override.yAxis}
                    </span>
                  )}
                </div>
              )}

              {/* Anomaly badge */}
              {chart.hasAnomaly && (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Spike detected
                  {chart.anomalyPeak !== undefined && (
                    <span className="font-bold">{chart.anomalyPeak.toLocaleString("en-IN")}</span>
                  )}
                </span>
              )}
            </div>

            {/* Pinned indicator */}
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#2185fb] bg-[#2185fb]">
              <Pin className="h-3.5 w-3.5 text-white" />
            </div>
          </div>

          {/* AI Insight Badge — from VisualDesign, expandable */}
          {chart.reasoning && (
            <div className="mt-3">
              <AIInsightBadge
                text={chart.reasoning}
                source={isAIActive ? "merged" : "heuristic"}
              />
            </div>
          )}
        </div>

        {/* Chart — uses ChartRenderer directly so we can pass overrideType */}
        <div className="px-5 pb-5 pt-4">
          {data.length === 0 ? (
            <div className="flex items-center justify-center h-[272px]">
              <p className="text-xs italic text-slate-300">Insufficient data for this visual.</p>
            </div>
          ) : (
            <ChartRenderer
              chart={chart}
              data={data}
              height={272}
              overrideType={override.type}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IceTable — ICE prioritization with live recalculation
// ─────────────────────────────────────────────────────────────────────────────

function IceTable({ rows }: { rows: IceRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            {["#", "Strategic Action", "Impact", "Confidence", "Effort", "ICE Score"].map((h) => (
              <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, i) => (
            <motion.tr
              key={row.id}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15, delay: i * 0.04 }}
              className="hover:bg-slate-50/60 transition-colors"
            >
              <td className="px-5 py-4 text-xs text-slate-400 font-mono">{i + 1}</td>
              <td className="px-5 py-4 font-medium text-slate-900 max-w-[280px] leading-snug">
                {row.bet.replace(/^\d+\.\s*/, "")}
              </td>
              <td className="px-5 py-4 tabular-nums text-slate-700">{row.impact}</td>
              <td className="px-5 py-4 tabular-nums text-slate-700">{row.confidence}</td>
              <td className="px-5 py-4 tabular-nums text-slate-700">{row.effort}</td>
              <td className="px-5 py-4">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold ${
                  row.score >= 8 ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : row.score >= 5 ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}>
                  {row.score}
                </span>
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GeneratingOverlay
// ─────────────────────────────────────────────────────────────────────────────

function GeneratingOverlay({ onComplete }: { onComplete: () => void }) {
  const [stepIdx,  setStepIdx]  = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStepIdx((prev) => {
        const next = prev + 1;
        setProgress(Math.round((next / GENERATE_STEPS.length) * 100));
        if (next >= GENERATE_STEPS.length) {
          clearInterval(id);
          setTimeout(onComplete, 320);
        }
        return next;
      });
    }, 270);
    return () => clearInterval(id);
  }, [onComplete]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-8">
      <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <CardContent className="py-16 flex flex-col items-center gap-7">
          <div className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 rounded-full border-2 border-slate-100" />
            <span className="absolute inset-0 rounded-full border-t-2 border-slate-800 animate-spin" />
            <FileText className="h-6 w-6 text-slate-400" />
          </div>
          <div className="w-full max-w-sm text-center space-y-2.5">
            <p className="text-sm font-semibold text-slate-800">Assembling board pack</p>
            <AnimatePresence mode="wait">
              <motion.p key={stepIdx} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="text-xs text-slate-400 h-5">
                {GENERATE_STEPS[Math.min(stepIdx, GENERATE_STEPS.length - 1)]}
              </motion.p>
            </AnimatePresence>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <motion.div animate={{ width: `${progress}%` }} transition={{ duration: 0.25, ease: "easeOut" }} className="h-full rounded-full bg-slate-800" />
            </div>
            <p className="text-[11px] text-slate-400">{progress}%</p>
          </div>
          <div className="flex gap-1.5">
            {GENERATE_STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 w-1.5 rounded-full transition-all duration-200 ${i < stepIdx ? "bg-slate-700" : "bg-slate-200"}`} />
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
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

export default function FinalReportView() {
  const nav      = useNavigate();
  const boardRef = useRef<HTMLDivElement | null>(null);

  // ── Store reads — single source of truth, ZERO analysis ─────────────────
  const { dataset, dashboard, report, schema } = useDatasetStore() as {
    dataset:   DatasetShape;
    dashboard: DashboardShape;
    report:    ReportShape;
    schema:    SchemaShape;
  };

  // Mount dual-audit to satisfy hasRun.current guard (no new network calls)
  useDualAudit();

  // ── UI state ──────────────────────────────────────────────────────────────
  const [generating,  setGenerating]  = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [toast,       setToast]       = useState<string | null>(null);
  // Editable ROI assumptions — seeded from store, live-controlled locally
  const [marginPct,  setMarginPct]   = useState<string>(() => report?.marginPct  ?? "18");
  const [hoursSaved, setHoursSaved]  = useState<string>(() => report?.hoursSaved ?? "10");

  // ── Customization overrides — synced from dashboard.activeTemplate ────────
  // activeTemplate is a typed Record<chartId, ChartOverride> written by
  // VisualDashboardView's Analyst Edit Mode. No JSON.parse needed.
  const overrides = useMemo<Record<string, ChartOverride>>(
    () => dashboard?.activeTemplate ?? {},
    [dashboard?.activeTemplate]
  );

  // ── Metadata ───────────────────────────────────────────────────────────────
  const datasetName    = dataset?.meta?.name ?? "Untitled dataset";
  const rowCount       = dataset?.rows?.length ?? 0;
  const colCount       = dataset?.columns?.length ?? 0;
  const boardTimestamp = useMemo(
    () => fmtTimestamp(dataset?.meta?.createdAt ?? dashboard?.generatedAt),
    [dataset?.meta?.createdAt, dashboard?.generatedAt]
  );

  // ── Strategy mirror ────────────────────────────────────────────────────────
  // ZERO new analysis — getTemplateStrategy is called only to resolve
  // transformedData for the pinned chart IDs. It does not modify the store.
  const template = (dashboard?.template ?? "auto") as TemplateId;
  const strategy = useMemo(
    () =>
      getTemplateStrategy(
        template,
        dataset?.columns ?? [],
        (dataset?.rows ?? []) as DatasetRecord[],
        schema?.columns as any,
        null,
        dashboard?.pinnedChartIds
      ),
    [template, dataset?.columns, dataset?.rows, schema?.columns, dashboard?.pinnedChartIds]
  );

  // ── Pinned charts ──────────────────────────────────────────────────────────
  const pinnedIds = useMemo<string[]>(
    () => dashboard?.pinnedChartIds ?? strategy.pinnedChartIds ?? [],
    [dashboard?.pinnedChartIds, strategy.pinnedChartIds]
  );
  const chartMap = useMemo(
    () => new Map(strategy.charts.map((c) => [c.id, c])),
    [strategy.charts]
  );
  const pinnedCharts = useMemo(
    () => pinnedIds.map((id) => chartMap.get(id)).filter((c): c is DashboardChart => Boolean(c)),
    [pinnedIds, chartMap]
  );

  // ── KPIs — DashboardKpi[] direct to KpiRibbon ─────────────────────────────
  const kpis = useMemo<DashboardKpi[]>(() => {
    const source = strategy.kpis?.length ? strategy.kpis : (dashboard?.kpis as DashboardKpi[] ?? []);
    return source;
  }, [strategy.kpis, dashboard?.kpis]);

  // ── Audit metadata ─────────────────────────────────────────────────────────
  const auditSource     = dashboard?.audit?.source     ?? strategy.audit?.source;
  const detectedPattern = dashboard?.audit?.detectedPattern ?? strategy.audit?.detectedPattern;
  const storedReasoning = dashboard?.audit?.reasoning   ?? strategy.audit?.reasoning;
  const isAIActive      = !!auditSource && auditSource !== "heuristic";
  const aiProvider      = providerLabel(auditSource);
  const patternConf     = dashboard?.audit?.patternConfidence;

  // ── Executive summary ──────────────────────────────────────────────────────
  const executiveSummary = useMemo(
    () =>
      report?.aiSummary?.trim() ||
      storedReasoning ||
      "No AI summary available. Use the KPI ribbon, strategy charts, and priority actions for the board review.",
    [report?.aiSummary, storedReasoning]
  );

  // ── Next moves ─────────────────────────────────────────────────────────────
const nextMoves = useMemo(() => {
  const normalized = (report?.nextMoves ?? [])
    .map((x) => {
      if (typeof x === "string") {
        return x.trim();
      }

      if (x && typeof x === "object") {
        const title =
          "title" in x && typeof x.title === "string" ? x.title.trim() : "";
        const why =
          "why" in x && typeof x.why === "string" ? x.why.trim() : "";

        return title || why || "";
      }

      return "";
    })
    .filter(Boolean);

  return normalized.length
    ? normalized
    : [
        "Review highest-risk data issues and confirm remediation ownership.",
        "Re-run the dashboard strategy after cleanup to validate directional changes.",
        "Align stakeholders on the top 3 board-level actions from this pack.",
      ];
}, [report?.nextMoves]);


  // ── ROI ────────────────────────────────────────────────────────────────────
  const marginVal     = Math.max(0, Number(marginPct) || 0);
  const hoursVal      = Math.max(0, Number(hoursSaved) || 0);
  const salesBase     = useMemo(() => estimateSalesBase(dataset), [dataset]);
  const monthlyProfit = salesBase * (marginVal / 100);
  const timeValue     = hoursVal * 4 * 500;
  const iceRows       = useMemo(
    () => buildIceRows(nextMoves, marginVal, hoursVal).sort((a, b) => b.score - a.score),
    [nextMoves, marginVal, hoursVal]
  );

  const anomalyCount = pinnedCharts.filter((c) => c.hasAnomaly).length;

  // ── Export: high-resolution PNG from off-screen surface ───────────────────
  const handleExportPng = useCallback(async () => {
    if (!boardRef.current) return;
    try {
      setIsExporting(true);
      const canvas = await html2canvas(boardRef.current, {
        backgroundColor: "#ffffff",
        scale: 2.5,           // 2.5× DPI — print-quality
        useCORS: true,
        logging: false,
        imageTimeout: 18000,
      });
      const url = canvas.toDataURL("image/png");
      const a   = document.createElement("a");
      a.href = url;
      a.download = `${(datasetName || "board").replace(/[^\w-]+/g, "_")}_board_pack_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      setToast("Board pack exported as PNG");
    } finally {
      setIsExporting(false);
    }
  }, [datasetName]);

  const handleExportCsv = useCallback(() => {
    if (!dataset?.columns?.length) return;
    const csv = toCsv(dataset.columns, (dataset.rows ?? []) as DatasetRecord[]);
    downloadText(`${(datasetName || "dataset").replace(/[^\w-]+/g, "_")}-cleaned.csv`, csv, "text/csv;charset=utf-8");
    setToast("Cleaned dataset exported as CSV");
  }, [dataset, datasetName]);

  // Copy insight: executive summary + next moves as plaintext
  const handleCopyInsight = useCallback(() => {
    const lines = [
      `AutoAnalyst Board Pack — ${datasetName}`,
      `Generated: ${boardTimestamp}`,
      "",
      "Executive Summary:",
      executiveSummary,
      "",
      "Key Actions:",
      ...nextMoves.map((m, i) => `${i + 1}. ${m.replace(/^\d+\.\s*/, "")}`),
      "",
      `Health Score: ${report?.score ?? "—"} / 100`,
      `AI Provider: ${aiProvider}`,
      "",
      "Strategic Audit by AutoAnalyst | Confidential",
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => setToast("Insight summary copied to clipboard"));
  }, [executiveSummary, nextMoves, datasetName, boardTimestamp, report?.score, aiProvider]);

  // WhatsApp share — wa.me web API with encoded text
  const handleShareWhatsApp = useCallback(() => {
    const preview = executiveSummary.length > 280 ? `${executiveSummary.slice(0, 280)}…` : executiveSummary;
    const text = encodeURIComponent(
      `*AutoAnalyst Report — ${datasetName}*\n\n${preview}\n\nHealth Score: ${report?.score ?? "—"}/100\n\n_Strategic Audit by AutoAnalyst | Confidential_`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  }, [datasetName, executiveSummary, report?.score]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!dataset) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans flex items-center justify-center px-8">
        <Card className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
              <FileText className="h-5 w-5 text-slate-400" />
            </div>
            <CardTitle className="text-lg font-semibold text-slate-900">No report data</CardTitle>
            <CardDescription className="text-sm text-slate-500">
              Complete the full pipeline — Upload → Schema → SQL → Visualize → Health — to generate the board pack.
            </CardDescription>
          </CardHeader>
          <div className="px-6 pb-6 flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => nav("/app/health")}>
              Back
            </Button>
            <Button size="sm" className="rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => nav("/app/upload")}>
              Start Pipeline
            </Button>
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

      <div className="mx-auto max-w-[1440px] px-8 py-8">

        {/* ════════════════════════════════════════════════════════════
            PAGE HEADER — top-right nav locked
        ════════════════════════════════════════════════════════════ */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-7">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              AutoAnalyst · Final Report
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Enterprise Board Pack</h1>
            <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
              Master Mirror — reflects analyst pipeline state. Zero re-analysis.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{datasetName}</span>
              <span className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                {rowCount.toLocaleString("en-IN")} rows · {colCount} cols
              </span>
              {!generating && (
                <>
                  <span className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                    {pinnedCharts.length} pinned charts
                  </span>
                  {anomalyCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {anomalyCount} spike{anomalyCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {isAIActive ? (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                      <Sparkles className="h-3.5 w-3.5" /> {aiProvider}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">
                      <Lock className="h-3.5 w-3.5" /> Offline Heuristics
                    </span>
                  )}
                  {Object.keys(overrides).length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700">
                      <Zap className="h-3.5 w-3.5" /> {Object.keys(overrides).length} analyst overrides applied
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* TOP-RIGHT: export + nav */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {!generating && (
              <Button variant="outline" size="sm" className="rounded-xl" disabled={isExporting} onClick={handleExportPng}>
                {isExporting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-1.5 h-3.5 w-3.5" />}
                {isExporting ? "Exporting…" : "Export Board Pack"}
              </Button>
            )}
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => nav("/app/health")}>
              Back
            </Button>
            <Button size="sm" className="rounded-xl bg-slate-900 text-white hover:bg-slate-800" onClick={() => nav("/")}>
              Finish &amp; Close
            </Button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            GENERATING OVERLAY
        ════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {generating && <GeneratingOverlay onComplete={() => setGenerating(false)} />}
        </AnimatePresence>

        {/* ════════════════════════════════════════════════════════════
            MAIN BOARD — revealed after generation animation
        ════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {!generating && (
            <motion.div key="board" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mt-8 space-y-7">

              {/* ══ OFF-SCREEN PRINT SURFACE (captured by html2canvas at 2.5×) ══ */}
              <div className="absolute -left-[99999px] top-0 pointer-events-none" aria-hidden>
                <div ref={boardRef} className="w-[1480px] bg-white p-14 font-sans text-slate-900">
                  {/* Print: branded header */}
                  <div className="flex items-start justify-between border-b border-slate-200 pb-8">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-400">AutoAnalyst · Enterprise Board Pack</p>
                      <h1 className="mt-2 text-[2.25rem] font-bold tracking-tight text-slate-900">Final Board Pack</h1>
                      <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">AI-verified strategy · Data-grounded actions · Board-ready</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {[datasetName, `${rowCount.toLocaleString("en-IN")} rows · ${colCount} cols`, `Template: ${strategy.resolvedTemplate}`, aiProvider].map((l) => (
                          <span key={l} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">{l}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-800">{datasetName}</p>
                      <p className="mt-1 text-xs text-slate-500">{boardTimestamp}</p>
                      <p className={`mt-2 inline-flex rounded-lg border px-3 py-1 text-xs font-semibold ${healthTone(report?.score).badge}`}>
                        Health {report?.score ?? 0} / 100
                      </p>
                    </div>
                  </div>

                  {/* Print: executive brief dark panel */}
                  <div className="mt-9 rounded-2xl bg-slate-900 p-8 text-white">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400 mb-3">Executive Brief</p>
                    <p className="text-sm leading-8 text-slate-200 max-w-5xl">{executiveSummary}</p>
                    <div className="mt-6 flex flex-wrap gap-2">
                      {detectedPattern && <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-slate-300">{detectedPattern}</span>}
                      <span className={`rounded-full border px-3 py-1 text-xs font-medium ${isAIActive ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border-white/10 bg-white/10 text-slate-300"}`}>
                        {isAIActive ? `AI · ${aiProvider}` : "Offline Heuristics"}
                      </span>
                    </div>
                  </div>

                  {/* Print: KPI ribbon */}
                  <div className="mt-8"><KpiRibbon kpis={kpis} /></div>

                  {/* Print: pinned charts 2-col grid */}
                  <div className="mt-10 grid grid-cols-2 gap-7">
                    {pinnedCharts.map((chart, i) => {
                      const ov = overrides[chart.id] ?? {};
                      return (
                        <div key={`print-${chart.id}`} className="rounded-xl border border-slate-200 bg-white p-6">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">Pinned Visual {i + 1}{ov.type ? ` · ${ov.type}` : ""}</p>
                          <p className="mt-1 text-base font-semibold text-slate-900">{chart.title}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{chart.description}</p>
                          {chart.reasoning && (
                            <div className="mt-3">
                              <AIInsightBadge text={chart.reasoning} source={isAIActive ? "merged" : "heuristic"} />
                            </div>
                          )}
                          <div className="mt-5">
                            <ChartRenderer chart={chart} data={(strategy.transformedData[chart.id] ?? []) as ChartPoint[]} height={228} overrideType={ov.type} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Print: ICE table */}
                  <div className="mt-10">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">ICE Prioritization Queue</p>
                    <IceTable rows={iceRows} />
                  </div>

                  {/* Print: watermark footer */}
                  <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-5 text-xs text-slate-400">
                    <span>{datasetName} · {boardTimestamp}</span>
                    <span className="font-semibold tracking-wide text-slate-600">Strategic Audit by AutoAnalyst | Confidential</span>
                    <span>{isAIActive ? `AI Mode · ${aiProvider}` : "Offline Heuristic Mode"}</span>
                  </div>
                </div>
              </div>
              {/* ── end print surface ── */}

              {/* ════════════════════════════════════════════════════════════
                  SECTION 1: EXECUTIVE HERO
                  Dark brief panel (2/3) + animated health ring card (1/3)
              ════════════════════════════════════════════════════════════ */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Dark executive brief */}
                <div className="lg:col-span-2 flex flex-col justify-between rounded-2xl border border-slate-900 bg-slate-900 p-8 text-white min-h-[240px]">
                  <div>
                    <div className="flex items-center gap-2.5 mb-5">
                      <BookOpen className="h-4 w-4 text-slate-400" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400">Executive Brief</p>
                      <span className="ml-auto rounded-lg border border-white/10 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">Board-ready</span>
                    </div>
                    <p className="text-sm leading-8 text-slate-200 max-w-2xl">{executiveSummary}</p>
                  </div>
                  <div className="mt-7 flex flex-wrap gap-2">
                    {detectedPattern && <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-slate-300">{detectedPattern}</span>}
                    <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-slate-300">{strategy.resolvedTemplate} template</span>
                    {auditSource && (
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${isAIActive ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-300" : "border-white/10 bg-white/10 text-slate-300"}`}>
                        {isAIActive ? `AI · ${aiProvider}` : "Offline Heuristics"}
                      </span>
                    )}
                    {patternConf !== undefined && (
                      <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-xs text-slate-300">
                        Confidence {Math.round(patternConf * 100)}%
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${healthTone(report?.score).badge}`}>
                      Health {report?.score ?? 0} / 100
                    </span>
                  </div>
                </div>

                {/* Health ring card */}
                <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col items-center justify-center py-10 px-6 gap-5">
                  <HealthRing score={report?.score} animated />
                  {/* Top-3 alert pills */}
                  {(report?.alerts ?? []).length > 0 && (
                    <div className="w-full space-y-2 mt-1">
                      {(report?.alerts ?? []).slice(0, 3).map((a, i) => (
                        <div key={i} className={`flex items-start gap-2 rounded-xl border px-3 py-2 ${
                          a.severity === "high" ? "border-rose-200 bg-rose-50"
                            : a.severity === "med" ? "border-amber-200 bg-amber-50"
                            : "border-emerald-200 bg-emerald-50"
                        }`}>
                          <AlertCircle className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${
                            a.severity === "high" ? "text-rose-500" : a.severity === "med" ? "text-amber-500" : "text-emerald-500"
                          }`} />
                          <p className={`text-[11px] font-medium leading-relaxed ${
                            a.severity === "high" ? "text-rose-800" : a.severity === "med" ? "text-amber-800" : "text-emerald-800"
                          }`}>{a.title ?? a.detail ?? "Alert"}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              {/* ════════════════════════════════════════════════════════════
                  SECTION 2: KPI COMMAND BAR
                  bg-[#f3f4f6] ribbon — DashboardKpi[] directly to KpiRibbon
              ════════════════════════════════════════════════════════════ */}
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                  Key Performance Indicators
                </p>
                <KpiRibbon kpis={kpis} />
              </div>

              {/* ════════════════════════════════════════════════════════════
                  SECTION 3: STRATEGIC ROADMAP
                  nextMoves from store, severity badges, vertical timeline
              ════════════════════════════════════════════════════════════ */}
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <Target className="h-4 w-4 text-slate-400" />
                    <CardTitle className="text-sm font-semibold text-slate-900">Strategic Roadmap</CardTitle>
                    <span className="ml-auto rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500">
                      {nextMoves.length} actions
                    </span>
                  </div>
                  <CardDescription className="text-xs text-slate-400 leading-relaxed">
                    Ordered by severity — resolve high-priority items before board presentation
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="relative space-y-3">
                    <div className="absolute left-[1.85rem] top-9 bottom-4 w-px bg-slate-100" aria-hidden />
                    {nextMoves.slice(0, 6).map((move, i) => {
                      const sev = moveSeverity(i);
                      return (
                        <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: i * 0.045 }}
                          className="relative flex items-start gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-[12px] font-bold text-white relative z-10">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 leading-snug">{move.replace(/^\d+\.\s*/, "")}</p>
                          </div>
                          <span className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${sev.cls}`}>{sev.label}</span>
                        </motion.div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* ════════════════════════════════════════════════════════════
                  SECTION 4: PINNED VISUAL GALLERY + EXPORT SIDEBAR
                  Left: 2-col pinned gallery with analyst overrides + AI badges
                  Right: Export, Share, ROI assumptions
              ════════════════════════════════════════════════════════════ */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_296px]">

                {/* Pinned chart gallery */}
                <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <CardHeader className="pb-4 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <TrendingUp className="h-4 w-4 text-slate-400" />
                        <CardTitle className="text-sm font-semibold text-slate-900">Analyst-Pinned Visuals</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">{pinnedCharts.length} charts</span>
                        {anomalyCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700">
                            <AlertCircle className="h-3 w-3" />{anomalyCount} spike{anomalyCount > 1 ? "s" : ""}
                          </span>
                        )}
                        {Object.keys(overrides).length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                            <Zap className="h-3 w-3" /> Analyst overrides active
                          </span>
                        )}
                      </div>
                    </div>
                    <CardDescription className="text-xs text-slate-400 leading-relaxed">
                      Charts pinned in Visual Dashboard. Analyst axis/type overrides applied. AI reasoning badges included.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {pinnedCharts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16">
                        <TrendingUp className="mb-3 h-8 w-8 text-slate-300" />
                        <p className="text-sm text-slate-400">No charts pinned yet.</p>
                        <p className="mt-1 text-xs text-slate-400">Pin charts in the Visual Dashboard to populate this gallery.</p>
                        <Button size="sm" variant="outline" className="mt-4 rounded-xl" onClick={() => nav("/app/visualize")}>
                          Go to Visual Dashboard
                        </Button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        {pinnedCharts.map((chart) => (
                          <PinnedChartCard
                            key={chart.id}
                            chart={chart}
                            data={(strategy.transformedData[chart.id] ?? []) as ChartPoint[]}
                            override={overrides[chart.id] ?? {}}
                            isAIActive={isAIActive}
                            isPinned={true}
                          />
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Export & sharing sidebar */}
                <div className="flex flex-col gap-4">

                  {/* Export actions */}
                  <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Download className="h-4 w-4 text-slate-400" />
                        <CardTitle className="text-sm font-semibold text-slate-900">Export Actions</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-2">
                      <Button className="w-full justify-start rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-xs h-9" disabled={isExporting} onClick={handleExportPng}>
                        {isExporting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Download className="mr-2 h-3.5 w-3.5" />}
                        {isExporting ? "Generating PNG…" : "Download Board as PNG"}
                      </Button>
                      <Button variant="outline" className="w-full justify-start rounded-xl text-xs h-9" disabled={isExporting} onClick={handleExportPng}>
                        <FileText className="mr-2 h-3.5 w-3.5" /> Export Charts as PNG
                      </Button>
                      <Button variant="outline" className="w-full justify-start rounded-xl text-xs h-9" onClick={handleExportCsv}>
                        <Download className="mr-2 h-3.5 w-3.5" /> Download Cleaned Dataset (CSV)
                      </Button>
                      <Button variant="outline" className="w-full justify-start rounded-xl text-xs h-9" onClick={() => window.print()}>
                        <Printer className="mr-2 h-3.5 w-3.5" /> Print Report
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Share & distribute */}
                  <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <Share2 className="h-4 w-4 text-slate-400" />
                        <CardTitle className="text-sm font-semibold text-slate-900">Share &amp; Distribute</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-2">
                      <Button variant="outline" className="w-full justify-start rounded-xl text-xs h-9" onClick={handleShareWhatsApp}>
                        <Share2 className="mr-2 h-3.5 w-3.5 text-green-600" /> Share via WhatsApp
                      </Button>
                      <Button variant="outline" className="w-full justify-start rounded-xl text-xs h-9" onClick={() => setToast("Email scheduling — coming in V2")}>
                        <Mail className="mr-2 h-3.5 w-3.5" /> Schedule Weekly Email
                      </Button>
                      <Button variant="outline" className="w-full justify-start rounded-xl text-xs h-9" onClick={handleCopyInsight}>
                        <Copy className="mr-2 h-3.5 w-3.5" /> Copy Insight Summary
                      </Button>
                    </CardContent>
                  </Card>

                  {/* ROI assumptions — live ICE recalculation */}
                  <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <CardHeader className="pb-3 border-b border-slate-100">
                      <CardTitle className="text-sm font-semibold text-slate-900">ROI Assumptions</CardTitle>
                      <CardDescription className="text-xs text-slate-400">Adjusting updates ICE scores in real time</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Assumed Margin %</p>
                        <Input inputMode="decimal" value={marginPct} onChange={(e) => setMarginPct(e.target.value)} className="h-8 text-xs border-slate-200 rounded-xl" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Hours Saved / Week</p>
                        <Input inputMode="decimal" value={hoursSaved} onChange={(e) => setHoursSaved(e.target.value)} className="h-8 text-xs border-slate-200 rounded-xl" />
                      </div>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-center">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">Monthly Profit</p>
                          <p className="mt-1 text-xs font-bold text-slate-800 truncate" title={fmtCurrency(monthlyProfit)}>{fmtCurrency(monthlyProfit)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-center">
                          <p className="text-[10px] font-semibold uppercase text-slate-400">Time Value</p>
                          <p className="mt-1 text-xs font-bold text-slate-800 truncate" title={fmtCurrency(timeValue)}>{fmtCurrency(timeValue)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* ════════════════════════════════════════════════════════════
                  SECTION 5: ICE PRIORITIZATION TABLE
                  Action · Impact · Confidence · Effort · Score
                  Derived from nextMoves + ROI assumptions — live recalc
              ════════════════════════════════════════════════════════════ */}
              <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <CardHeader className="pb-4 border-b border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Target className="h-4 w-4 text-slate-400" />
                      <CardTitle className="text-sm font-semibold text-slate-900">ICE Prioritization Queue</CardTitle>
                    </div>
                    <div className="flex gap-5">
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase text-slate-400">Est. Monthly Profit</p>
                        <p className="text-sm font-bold text-slate-900 tabular-nums">{fmtCurrency(monthlyProfit)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold uppercase text-slate-400">Est. Time Value</p>
                        <p className="text-sm font-bold text-slate-900 tabular-nums">{fmtCurrency(timeValue)}</p>
                      </div>
                    </div>
                  </div>
                  <CardDescription className="text-xs text-slate-400 leading-relaxed">
                    ICE scores recalculate live from Margin % and Hours Saved inputs. Sorted by score descending.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <IceTable rows={iceRows} />
                </CardContent>
              </Card>

              {/* ════════════════════════════════════════════════════════════
                  SECTION 6: AUDIT TRAIL FOOTER
                  Metadata: Rows/Cols analysed · Timestamp · AI Provider
                  Watermark: "Strategic Audit by AutoAnalyst | Confidential"
              ════════════════════════════════════════════════════════════ */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 px-6 py-4">
                  <div className="flex items-center gap-2.5">
                    <History className="h-4 w-4 text-slate-400" />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Audit Trail &amp; Source Credibility
                    </p>
                    {/* AI provider badge */}
                    <span className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium ${
                      isAIActive ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"
                    }`}>
                      {isAIActive ? <><Sparkles className="h-3 w-3" /> {aiProvider}</> : <><Lock className="h-3 w-3" /> Offline Heuristics</>}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 divide-y divide-slate-100 md:grid-cols-3 md:divide-x md:divide-y-0">
                  {[
                    {
                      icon: <FileText className="h-4 w-4 text-slate-400" />,
                      label: "Source File",
                      value: datasetName,
                      detail: `Indexed ${boardTimestamp}`,
                    },
                    {
                      icon: <CheckCircle2 className="h-4 w-4 text-slate-400" />,
                      label: "Heuristics Applied",
                      value: detectedPattern ? `${detectedPattern} Playbook` : "AutoAnalyst DNA Engine v5.0",
                      detail: `${aiProvider} · 800-row privacy cap`,
                    },
                    {
                      icon: <Clock className="h-4 w-4 text-slate-400" />,
                      label: "Pipeline Stats",
                      value: `${rowCount.toLocaleString("en-IN")} rows · ${colCount} cols`,
                      detail: `${pinnedCharts.length} charts pinned · ${(report?.alerts ?? []).length} issues logged · ${Object.keys(overrides).length} overrides`,
                    },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3.5 px-6 py-5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50">{item.icon}</div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</p>
                        <p className="mt-0.5 text-xs font-semibold text-slate-800 leading-snug">{item.value}</p>
                        <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Watermark strip */}
                <div className="border-t border-slate-100 bg-slate-50/80 px-6 py-3 flex items-center justify-between">
                  <p className="text-xs text-slate-400">Generated {boardTimestamp} · AutoAnalyst v5.0</p>
                  <p className="text-xs font-semibold tracking-wide text-slate-600">
                    Strategic Audit by AutoAnalyst | Confidential
                  </p>
                  <p className="text-xs text-slate-400">{isAIActive ? `AI Mode · ${aiProvider}` : "Offline Heuristic Mode"}</p>
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}