// ─────────────────────────────────────────────────────────────────────────────
// src/lib_old/DatasetStore.ts  —  AutoAnalyst Global State Store  v3.0
//
// useSyncExternalStore-based store — no Context, no prop-drilling.
// Every view (Visual, Health, Final) reads and writes the same singleton.
//
// WHAT CHANGED IN v3.0:
//   • DashboardState.activeTemplate is now a typed ChartOverrideMap
//     (Record<chartId, ChartOverride>) instead of a raw JSON string.
//     FinalReportView reads this directly to render the analyst's exact
//     X/Y axis and chart type — no JSON.parse() needed at read time.
//   • ReportState extended with healthScore, roiParameters, and enriched
//     NextMove (now imported from AuditTypes — title, why, impact, confidence,
//     effort). The ICE table in FinalReportView is derived from these fields.
//   • StoredAudit now includes executiveSummary and nextMoves (string[])
//     so Health.tsx and FinalReportView.tsx can read the AI narrative
//     without accessing CombinedAudit directly.
//   • datasetStore.setDashboard() and datasetStore.setReport() are
//     convenience writers that merge deeply rather than shallow-replacing.
//   • datasetStore.setAudit() atomically writes to both dashboard.audit
//     and report (aiSummary, nextMoves) in a single emit cycle.
//   • All State keys are exported as StoreKey for consumers that want
//     type-safe key access via setKey().
//
// READ PATH — who reads what:
//   VisualDashboardView  → dashboard.audit, dashboard.activeTemplate,
//                          dashboard.pinnedChartIds, dashboard.kpis
//   Health.tsx           → dashboard.audit, report.healthScore,
//                          report.aiSummary, report.nextMoves,
//                          report.roiParameters
//   FinalReportView.tsx  → dashboard.activeTemplate (ChartOverrideMap),
//                          dashboard.pinnedChartIds, report.aiSummary,
//                          report.nextMoves, report.healthScore,
//                          report.roiParameters, report.alerts
//
// WRITE PATH — who writes what:
//   useDualAudit         → datasetStore.setAudit(combinedAudit)
//   VisualDashboardView  → datasetStore.setDashboard({ activeTemplate,
//                          pinnedChartIds })
//   Health.tsx           → datasetStore.setReport({ healthScore,
//                          roiParameters })
// ─────────────────────────────────────────────────────────────────────────────

import { useSyncExternalStore } from "react";
import type { ColumnProfile, Dataset } from "./DatasetTypes";
import type { BaseModelSignals } from "@/lib/visualstrategies";
import type { NextMove, RoiParameters, CombinedAudit } from "@/types/AuditTypes";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — AuditSource
// Single source of truth for the audit provider union.
// Imported by visualstrategies.ts and AuditTypes.ts — never redefined elsewhere.
// ─────────────────────────────────────────────────────────────────────────────

export type AuditSource =
  | "merged"           // Both Gemini + DeepSeek R1 responded
  | "gemini-only"      // Only Gemini responded
  | "openrouter-only"  // Only DeepSeek R1 via OpenRouter responded
  | "heuristic"        // Neither AI responded — rule engine only
  | "llm-bridge";      // Single custom provider via VITE_LLM_AUDIT_METADATA

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Chart primitive types
// ─────────────────────────────────────────────────────────────────────────────

export type KPI = {
  label: string;
  value: string;
  hint?: string;
};

export type ChartSpec =
  | { kind: "bar";       title: string; xKey: string;  yKey: string;      data: any[] }
  | { kind: "line";      title: string; xKey: string;  yKey: string;      data: any[] }
  | { kind: "area";      title: string; xKey: string;  yKey: string;      data: any[] }
  | { kind: "pie";       title: string; nameKey: string; valueKey: string; data: any[] }
  | { kind: "scatter";   title: string; xKey: string;  yKey: string;      data: any[] }
  | { kind: "histogram"; title: string; binKey: string; countKey: string; data: any[] }
  | { kind: "heatmap";   title: string; rowKey: string; colKeys: string[]; data: any[]; max: number }
  | { kind: "pivot";     title: string; rowKey: string; colKeys: string[]; data: any[]; valueFormat?: "inr" | "number" }
  | { kind: "table";     title: string; columns: string[]; rows: any[] };

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Analyst chart overrides (Axis Remapping)
//
// Written by VisualDashboardView when the analyst uses Analyst Mode to remap
// axes or change chart type.  Read by FinalReportView to render the EXACT
// chart the analyst configured — no JSON.parse() needed at read time.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-chart analyst customisation from the Analyst Edit Mode panel.
 * All fields are optional — absent means "use rule-engine default".
 */
export type ChartOverride = {
  /** Chart type override (e.g. switching from "bar" to "area") */
  type?: string;
  /** X-axis column override — dimension column name */
  xKey?: string;
  /** Y-axis column override — metric column name */
  yKey?: string;
};

/**
 * The full override map persisted in dashboard.activeTemplate.
 * Key = chart ID (matches DashboardChart.id from visualstrategies).
 * Value = partial override (only the keys the analyst changed).
 *
 * Usage in FinalReportView:
 *   const ov = dashboard.activeTemplate?.[chart.id] ?? {}
 *   const effectiveType = ov.type ?? chart.type
 *   const effectiveXKey = ov.xKey ?? chart.defaultXKey
 */
export type ChartOverrideMap = Record<string, ChartOverride>;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — StoredAudit
//
// The subset of CombinedAudit that is persisted to localStorage and read
// by the UI layer.  Includes executiveSummary and nextMoves (string[]) so
// Health.tsx and FinalReportView can access AI narrative fields directly
// without importing CombinedAudit or calling the API again.
// ─────────────────────────────────────────────────────────────────────────────

export type StoredAudit = {
  // ── Pattern (from Gemini) ──────────────────────────────────────────────────
  detectedPattern:   string;
  recommendedCharts: string[];
  patternConfidence: number;
  primarySignals:    string[];

  // ── Narrative (from DeepSeek R1) ──────────────────────────────────────────
  /** Why this visual strategy — shown in Health.tsx reasoning accordion */
  reasoning:        string;
  /**
   * CFO-ready executive brief — shown in FinalReportView dark panel and
   * Health.tsx Executive Briefing.  Also mirrored into report.aiSummary.
   */
  executiveSummary: string;
  /**
   * Raw AI next-move strings from DeepSeek R1.
   * useDualAudit maps these into NextMove[] (with ICE fields) in report.nextMoves.
   * Stored here as strings for WhatsApp share / clipboard copy.
   */
  nextMoves:        string[];
  /** Risk flags detected in the dataset structure */
  riskFlags:        string[];

  // ── Pipeline metadata ──────────────────────────────────────────────────────
  source:       AuditSource;
  generatedAt:  number;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — DashboardState
//
// Owns the visual strategy layer: charts, KPIs, audit, and analyst overrides.
// Written by VisualDashboardView and useDualAudit.
// Read by VisualDashboardView, Health.tsx, and FinalReportView.
// ─────────────────────────────────────────────────────────────────────────────

export type DashboardState = {
  // ── Legacy fields (unchanged) ──────────────────────────────────────────────
  metric:      string | null;
  segment:     string | null;
  time:        string | null;
  kpis:        any[];
  charts:      any[];
  generatedAt: number;

  /**
   * Analyst chart customisations from Analyst Edit Mode.
   *
   * Type: ChartOverrideMap = Record<chartId, ChartOverride>
   *
   * Written by VisualDashboardView.updateOverride() on every axis/type change.
   * Read by FinalReportView to apply overrides to pinned chart rendering:
   *
   *   const ov = dashboard.activeTemplate?.[chart.id] ?? {}
   *   <ChartRenderer overrideType={ov.type} />
   *
   * Typed as ChartOverrideMap (not string) — no JSON.parse() at read time.
   */
  activeTemplate?: ChartOverrideMap | null;

  /**
   * IDs of charts the analyst pinned in VisualDashboardView.
   * FinalReportView uses this to render ONLY the pinned charts.
   */
  pinnedChartIds?: string[];

  /**
   * AI audit metadata written by useDualAudit after the pipeline resolves.
   * VisualDashboard reads source/primarySignals for badge display.
   * Health.tsx reads reasoning/executiveSummary/patternConfidence.
   * FinalReportView reads source for the audit trail footer.
   */
  audit?: StoredAudit | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — ReportState (The Strategy Layer)
//
// Owns the business intelligence layer: health score, executive narrative,
// next moves with ICE metadata, ROI parameters, and issue alerts.
// Written by Health.tsx and useDualAudit.
// Read by Health.tsx and FinalReportView.
// ─────────────────────────────────────────────────────────────────────────────

export type Alert = {
  title:    string;
  detail:   string;
  severity: "low" | "med" | "high";
};

export type SWOT = {
  strengths:     string[];
  weaknesses:    string[];
  opportunities: string[];
  threats:       string[];
};

export type GstFindings = {
  gstinCol:      string | null;
  taxCol:        string | null;
  missingGSTIN:  number | null;
};

export type ReportState = {
  /**
   * CFO-ready executive brief from DeepSeek R1 (mirrored from StoredAudit.executiveSummary).
   * Used as the dark-panel text in FinalReportView and the briefing in Health.tsx.
   */
  aiSummary?: string;

  /**
   * ICE-enriched next moves.  Written by useDualAudit.setAudit() which maps the
   * raw AI strings into { title, why, impact, confidence, effort }.
   * Health.tsx Strategic Roadmap and FinalReportView ICE Table consume this directly.
   *
   * Imported from AuditTypes — keeping the shape in one place.
   */
  nextMoves?: NextMove[];

  /**
   * Business Vitality Score (0–100).
   * Written by Health.tsx computeRetailHealth() + optional AI hybrid modulation.
   * Read by FinalReportView HealthRing and the audit trail footer.
   */
  healthScore?: number;

  /**
   * What-If sidebar inputs from Health.tsx.
   * Written when the analyst adjusts the Margin % or Hours Saved sliders.
   * Read by FinalReportView to initialise the ICE ROI inputs at the last
   * value the analyst set — the board pack always reflects their scenario.
   */
  roiParameters?: RoiParameters;

  /**
   * Issue alerts from the heuristic engine (null density, duplicates, outliers).
   * Read by FinalReportView HealthRing card sub-KPI pills.
   * Severity drives the colour coding: "high" → rose, "med" → amber, "low" → emerald.
   */
  alerts?: Alert[];

  // ── Legacy fields (unchanged) ──────────────────────────────────────────────
  swot?:        SWOT;
  gst?:         GstFindings;
  generatedAt:  number;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — Remaining domain types (unchanged from v2)
// ─────────────────────────────────────────────────────────────────────────────

export type Role = "founder" | "marketing" | "ops" | "viewer";

export type AccessPolicy = {
  role:         Role;
  allowedViews: ("visual" | "health" | "final")[];
  piiMasking:   boolean;
  rowLevel?:    { column: string; equalsAny: string[] } | null;
};

export type AuditEvent = {
  at:      number;
  actor:   string;
  action:  string;
  detail?: string;
};

export type Comment = {
  id:         string;
  at:         number;
  author:     string;
  chartTitle: string;
  text:       string;
  mentions?:  string[];
};

export type Task = {
  id:      string;
  title:   string;
  owner:   string;
  dueAt?:  number;
  status:  "open" | "done";
};

export type UsageMeter = {
  monthKey: string;
  events:   Record<string, number>;
};

export type IntegrationState = {
  connectors: {
    googleSheets: { enabled: boolean };
    mysql:        { enabled: boolean };
    postgres:     { enabled: boolean };
    bigquery:     { enabled: boolean };
    ga4:          { enabled: boolean };
    stripe:       { enabled: boolean };
    hubspot:      { enabled: boolean };
  };
  scheduling: {
    enabled:         boolean;
    cron?:           string;
    lastSyncAt?:     number;
    pipelineHealthy?: boolean;
  };
};

export type TrustState = {
  schemaValidated:        boolean;
  missingValueDetection:  boolean;
  outlierExplanation:     boolean;
  freshness?: {
    lastUpdatedAt?: number;
    status: "fresh" | "stale" | "unknown";
  };
};

export type CollaborationState = {
  sharedDashboards: {
    enabled:     boolean;
    visibility:  "private" | "team" | "public";
    publicId?:   string;
  };
  comments: Comment[];
  tasks:    Task[];
};

export type ProductState = {
  rbac:          AccessPolicy;
  audit:         AuditEvent[];
  trust:         TrustState;
  integrations:  IntegrationState;
  collaboration: CollaborationState;
  usage:         UsageMeter;
  templates:     { industry?: string | null };
  memory:        { enabled: boolean; notes: string[] };
  whiteLabel:    { enabled: boolean; brandName?: string };
};

export type TransformOp =
  | { kind: "select";    columns: string[] }
  | { kind: "filter";    column: string; op: "contains" | "equals" | "gt" | "lt" | "isNull" | "notNull"; value?: string }
  | { kind: "rename";    from: string; to: string }
  | { kind: "delete";    columns: string[] }
  | { kind: "cast";      column: string; to: "number" | "date" | "text" }
  | { kind: "dedupe";    keyColumns: string[] }
  | { kind: "autoclean"; strict: true };

export type TransformStep = {
  id:        string;
  label:     string;
  createdAt: number;
  op:        TransformOp;
};

export type AIConfig = {
  provider:   "auto" | "local" | "cloud";
  localModel: string;
};

export type TransformMode =
  | "ai-auto"
  | "sql-manual"
  | "sql-query-result"
  | "schema-detected"
  | null;

export type DetectedFormat =
  | "Tally Export"
  | "Zoho Books"
  | "Bank Statement"
  | "POS Export"
  | "Google Sheets/Excel"
  | "Unknown"
  | null;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 8 — Root State
// The complete shape of the singleton store.
// All keys are exported as StoreKey for type-safe setKey() usage.
// ─────────────────────────────────────────────────────────────────────────────

export type State = {
  /** The original unmodified dataset (before transforms) */
  baseDataset:    Dataset | null;
  /** The current working dataset (after transforms) */
  dataset:        Dataset | null;
  /** Column profiles from the Schema Detection step */
  schema:         ColumnProfile[] | null;
  /** Detailed column profiles including DNA roles */
  profiles:       ColumnProfile[] | null;
  /** Detected file format from the upload step */
  detectedFormat: DetectedFormat;
  /** BaseModelSignals from the rule engine — used by Health.tsx confidence display */
  signals:        BaseModelSignals | null;
  /** Visual Dashboard state: charts, KPIs, audit, overrides, pinned IDs */
  dashboard:      DashboardState | null;
  /** SQL Sandbox transform history */
  transforms:     TransformStep[];
  /** How the current transforms were created */
  transformMode:  TransformMode;
  /** Strategy layer: health score, AI narrative, next moves, ROI params */
  report:         ReportState | null;
  /** Product features: RBAC, integrations, collaboration, usage */
  product:        ProductState | null;
  /** AI provider configuration */
  ai:             AIConfig;
};

/** Type-safe key accessor for datasetStore.setKey() */
export type StoreKey = keyof State;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 9 — Store implementation
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "autoanalyst:state:v3";

const monthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const defaultProduct = (): ProductState => ({
  rbac: {
    role:         "founder",
    allowedViews: ["visual", "health", "final"],
    piiMasking:   true,
    rowLevel:     null,
  },
  audit: [],
  trust: {
    schemaValidated:       false,
    missingValueDetection: true,
    outlierExplanation:    true,
    freshness: { status: "unknown", lastUpdatedAt: undefined },
  },
  integrations: {
    connectors: {
      googleSheets: { enabled: false },
      mysql:        { enabled: false },
      postgres:     { enabled: false },
      bigquery:     { enabled: false },
      ga4:          { enabled: false },
      stripe:       { enabled: false },
      hubspot:      { enabled: false },
    },
    scheduling: {
      enabled:         false,
      cron:            undefined,
      lastSyncAt:      undefined,
      pipelineHealthy: true,
    },
  },
  collaboration: {
    sharedDashboards: { enabled: false, visibility: "private" },
    comments: [],
    tasks:    [],
  },
  usage:     { monthKey: monthKey(), events: {} },
  templates: { industry: null },
  memory:    { enabled: true, notes: [] },
  whiteLabel: { enabled: false, brandName: undefined },
});

// ─── Initial state ─────────────────────────────────────────────────────────

let state: State = {
  baseDataset:    null,
  dataset:        null,
  schema:         null,
  profiles:       null,
  detectedFormat: null,
  signals:        null,
  dashboard:      null,
  transforms:     [],
  transformMode:  null,
  report:         null,
  product:        defaultProduct(),
  ai:             { provider: "local", localModel: "Llama 3.2 1B Instruct" },
};

// ─── Reactive listener set ─────────────────────────────────────────────────

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

// ─── LocalStorage helpers ──────────────────────────────────────────────────

function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function saveToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Silently ignore quota errors — store remains in memory
  }
}

function hydrateFromStorage() {
  const saved = safeParse<Partial<State>>(localStorage.getItem(STORAGE_KEY));
  if (!saved) return;

  state = {
    ...state,
    ...saved,
    // Explicit merges for arrays/objects to avoid full replacement with null
    schema:        saved.schema        ?? state.schema,
    profiles:      saved.profiles      ?? state.profiles,
    detectedFormat: saved.detectedFormat ?? state.detectedFormat,
    signals:       saved.signals       ?? state.signals,
    transforms:    saved.transforms    ?? state.transforms,
    transformMode: saved.transformMode ?? state.transformMode,
    report:        saved.report        ?? state.report,
    product:       saved.product       ?? defaultProduct(),
    ai:            saved.ai            ?? state.ai,
  };

  // Guards against corrupted product state from older store versions
  if (!state.product) state.product = defaultProduct();
  if (!state.product.usage?.monthKey) {
    state.product.usage = {
      monthKey: monthKey(),
      events:   state.product.usage?.events ?? {},
    };
  }
  if (!state.ai?.localModel) {
    state.ai = { provider: "local", localModel: "Llama 3.2 1B Instruct" };
  }
}

hydrateFromStorage();

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 10 — datasetStore API
//
// All mutation goes through datasetStore.set() (shallow merge) or the
// convenience writers below that handle deep partial merges.
// ─────────────────────────────────────────────────────────────────────────────

export const datasetStore = {
  // ── Core read/write ─────────────────────────────────────────────────────────

  /** Returns the current state snapshot (stable reference between emits) */
  get: () => state,

  /**
   * Shallow-merges patch into root state, saves to localStorage, and notifies
   * all useSyncExternalStore subscribers in a single synchronous cycle.
   *
   * For dashboard/report, prefer the typed convenience writers below
   * (setDashboard, setReport, setAudit) which do deep partial merges.
   */
  set: (patch: Partial<State>) => {
    state = { ...state, ...patch };
    saveToStorage();
    emit();
  },

  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  // ── Type-safe single-key writer ─────────────────────────────────────────────

  setKey: <K extends StoreKey>(key: K, value: State[K]) => {
    datasetStore.set({ [key]: value } as Pick<State, K>);
  },

  // ── Domain convenience writers ──────────────────────────────────────────────

  /**
   * Deep-merges patch into the existing DashboardState.
   * Safe to call with a partial — absent keys are preserved.
   *
   * Example — update only the activeTemplate without touching audit or kpis:
   *   datasetStore.setDashboard({ activeTemplate: newOverrideMap })
   */
  setDashboard: (patch: Partial<DashboardState>) => {
    const current = state.dashboard ?? {
      metric:      null,
      segment:     null,
      time:        null,
      kpis:        [],
      charts:      [],
      generatedAt: Date.now(),
    };
    datasetStore.set({ dashboard: { ...current, ...patch } });
  },

  /**
   * Deep-merges patch into the existing ReportState.
   * Safe to call with a partial — absent keys are preserved.
   *
   * Example — update only roiParameters without touching healthScore:
   *   datasetStore.setReport({ roiParameters: { marginPct: 22, hoursSaved: 14 } })
   */
  setReport: (patch: Partial<ReportState>) => {
    const current = state.report ?? { generatedAt: Date.now() };
    datasetStore.set({ report: { ...current, ...patch } });
  },

  /**
   * Atomic audit writer — called by useDualAudit when the pipeline resolves.
   *
   * In a single emit cycle, this:
   *   1. Writes the full StoredAudit to dashboard.audit
   *   2. Mirrors aiSummary and nextMoves (string[]) to report
   *   3. Updates report.nextMoves (NextMove[]) from the mapped ICE array
   *
   * Consumers never need to read from two slices — both dashboard and report
   * are always consistent after this call.
   *
   * @param audit   The full CombinedAudit from POST /api/audit
   * @param mapped  ICE-enriched NextMove[] built by useDualAudit.buildNextMoves()
   */
  setAudit: (audit: CombinedAudit, mapped: NextMove[]) => {
    const storedAudit: StoredAudit = {
      detectedPattern:   audit.detectedPattern,
      recommendedCharts: audit.recommendedCharts,
      patternConfidence: audit.patternConfidence,
      primarySignals:    audit.primarySignals,
      reasoning:         audit.reasoning,
      executiveSummary:  audit.executiveSummary,
      nextMoves:         audit.nextMoves,   // raw strings for share/copy
      riskFlags:         audit.riskFlags,
      source:            audit.source,
      generatedAt:       audit.generatedAt,
    };

    const currentDash = state.dashboard ?? {
      metric: null, segment: null, time: null,
      kpis: [], charts: [], generatedAt: Date.now(),
    };
    const currentReport = state.report ?? { generatedAt: Date.now() };

    // Single state update → single saveToStorage() → single emit()
    state = {
      ...state,
      dashboard: {
        ...currentDash,
        audit: storedAudit,
      },
      report: {
        ...currentReport,
        aiSummary:   audit.executiveSummary,
        nextMoves:   mapped,              // ICE-enriched NextMove[]
        generatedAt: audit.generatedAt,
      },
    };

    saveToStorage();
    emit();
  },

  // ── Dataset / schema / format writers ──────────────────────────────────────

  setDataset: (dataset: Dataset | null) => {
    datasetStore.set({ dataset });
  },

  setBaseDataset: (baseDataset: Dataset | null) => {
    datasetStore.set({ baseDataset });
  },

  setSchema: (schema: ColumnProfile[] | null) => {
    datasetStore.set({ schema });
  },

  setProfiles: (profiles: ColumnProfile[] | null) => {
    datasetStore.set({ profiles });
  },

  setDetectedFormat: (detectedFormat: DetectedFormat) => {
    datasetStore.set({ detectedFormat });
  },

  // ── Full reset ──────────────────────────────────────────────────────────────

  /**
   * Resets the store to initial state and clears localStorage.
   * Called when the user uploads a new file.
   */
  resetAll: () => {
    state = {
      baseDataset:    null,
      dataset:        null,
      schema:         null,
      profiles:       null,
      detectedFormat: null,
      signals:        null,
      dashboard:      null,
      transforms:     [],
      transformMode:  null,
      report:         null,
      product:        defaultProduct(),
      ai:             { provider: "local", localModel: "Llama 3.2 1B Instruct" },
    };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    emit();
  },
};

export default datasetStore;

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 11 — React hook
// useSyncExternalStore ensures all subscribed components re-render
// synchronously on the same scheduler tick — no tearing.
// ─────────────────────────────────────────────────────────────────────────────

export function useDatasetStore(): State {
  return useSyncExternalStore(
    datasetStore.subscribe,
    datasetStore.get,
    datasetStore.get, // server snapshot (SSR compat)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 12 — Selector hooks
//
// Granular hooks that return a stable slice of the store.
// Using these instead of useDatasetStore() prevents components from re-rendering
// when unrelated slices change.
//
// Usage:
//   const dashboard = useDashboardState()  // re-renders only on dashboard changes
//   const report    = useReportState()     // re-renders only on report changes
// ─────────────────────────────────────────────────────────────────────────────

/** Returns only dashboard state — components using this won't re-render on report changes */
export function useDashboardState(): DashboardState | null {
  return useSyncExternalStore(
    datasetStore.subscribe,
    () => datasetStore.get().dashboard,
    () => datasetStore.get().dashboard,
  );
}

/** Returns only report state — components using this won't re-render on dashboard changes */
export function useReportState(): ReportState | null {
  return useSyncExternalStore(
    datasetStore.subscribe,
    () => datasetStore.get().report,
    () => datasetStore.get().report,
  );
}

/**
 * Returns only the StoredAudit — components using this won't re-render
 * on pinnedChartIds, activeTemplate, or kpi changes.
 */
export function useStoredAudit(): StoredAudit | null | undefined {
  return useSyncExternalStore(
    datasetStore.subscribe,
    () => datasetStore.get().dashboard?.audit,
    () => datasetStore.get().dashboard?.audit,
  );
}

/**
 * Returns only the ChartOverrideMap — FinalReportView uses this to
 * apply analyst customisations without subscribing to the full dashboard.
 */
export function useChartOverrides(): ChartOverrideMap {
  return useSyncExternalStore(
    datasetStore.subscribe,
    () => datasetStore.get().dashboard?.activeTemplate ?? {},
    () => datasetStore.get().dashboard?.activeTemplate ?? {},
  );
}

/**
 * Returns only the pinned chart IDs — avoids re-renders from audit/kpi changes.
 */
export function usePinnedChartIds(): string[] {
  return useSyncExternalStore(
    datasetStore.subscribe,
    () => datasetStore.get().dashboard?.pinnedChartIds ?? [],
    () => datasetStore.get().dashboard?.pinnedChartIds ?? [],
  );
}