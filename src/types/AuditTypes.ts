// ─────────────────────────────────────────────────────────────────────────────
// src/types/AuditTypes.ts  —  AutoAnalyst Dual-Provider Audit Pipeline  v2.0
//
// Canonical type definitions for the Gemini + DeepSeek R1 audit pipeline.
//
// Dependency graph (read-only in this file — no circular imports):
//   AuditSource      ← DatasetStore.ts   (single source of truth for the union)
//   AuditPayload     → POST /api/audit   (what the client sends)
//   StructuredAudit  ← Gemini            (schema routing + confidence scoring)
//   NarrativeAudit   ← DeepSeek R1       (board-quality prose + next moves)
//   CombinedAudit    → useDualAudit      (merged result, written to store)
//
// WHAT CHANGED IN v2.0:
//   • CombinedAudit is now the authoritative canonical output type.
//     Every field that any downstream view (Visual, Health, Final) reads
//     is defined here — no more partial inference from StoredAudit alone.
//   • NextMove extended to { title, why, impact, confidence, effort }
//     so the ICE table can be derived directly without re-mapping.
//   • RoiParameters added as a first-class type so Health and Final
//     share the same shape for the What-If / ICE sidebar inputs.
//   • BackgroundAuditStatus tracks async pipeline state so the UI
//     can show "AI brief loading…" without polling.
// ─────────────────────────────────────────────────────────────────────────────

import type { AuditSource } from "../lib_old/DatasetStore";

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Request payload
// What the client sends to POST /api/audit
// ─────────────────────────────────────────────────────────────────────────────

export type AuditPayload = {
  /** All column names from the loaded dataset */
  columns: string[];
  /** First 10–20 rows for the AI to inspect cell values */
  sampleRows: Record<string, unknown>[];
  /** Heuristic pattern from the previous rule-engine run — passed as a hint */
  detectedPattern?: string;
  /** Total row count for the narrative context */
  rowCount?: number;
  /** Dataset filename / display name for the narrative */
  datasetName?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Provider-specific output shapes
// These are intermediate types — useDualAudit merges them into CombinedAudit.
// ─────────────────────────────────────────────────────────────────────────────

/** Gemini structured output — schema routing and confidence scoring */
export type StructuredAudit = {
  /** Business pattern classified by Gemini (e.g. "High-Velocity Retail") */
  detectedPattern: string;
  /**
   * Ordered chart IDs that Gemini recommends — 6 to 8 items.
   * Passed to getTemplateStrategy() as the recommendedCharts hint.
   */
  recommendedCharts: string[];
  /** Confidence score 0.0 – 1.0 for the detected pattern */
  patternConfidence: number;
  /** Column-level signals Gemini identified (e.g. "date column present") */
  primarySignals: string[];
};

/** DeepSeek R1 narrative output — board-quality prose via OpenRouter */
export type NarrativeAudit = {
  /** 3–4 sentences: why this visual strategy, with specific column references */
  reasoning: string;
  /** 2–3 sentences: CFO-ready summary of the dataset's financial story */
  executiveSummary: string;
  /**
   * 5 specific actionable next steps — plain strings.
   * useDualAudit maps these to NextMove[] using buildNextMoves().
   */
  nextMoves: string[];
  /** 2–3 data quality or commercial risks detected in the dataset structure */
  riskFlags: string[];
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Shared derived types
// Used by both the API response and the store / UI layer.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ICE-enriched next move.
 * useDualAudit maps the AI's plain string list into this shape so that
 * Health.tsx and FinalReportView.tsx can build the ICE table without
 * any additional computation.
 *
 * Impact, Confidence, Effort are on a 1–10 scale.
 * ICE score = (impact × confidence) / effort — calculated by the hook,
 * not stored, so it can be recalculated live from roiParameters.
 */
export type NextMove = {
  /** Short headline — the plain AI string, truncated to ≤ 92 chars */
  title: string;
  /** Strategic rationale — references the detectedPattern explicitly */
  why: string;
  /** Optional KPI column reference this move addresses */
  kpiRef?: string;
  /** Impact score 1–10 (business value if executed) */
  impact: number;
  /** Confidence score 1–10 (certainty the action will resolve the issue) */
  confidence: number;
  /** Effort score 1–10 (higher = more expensive / time-consuming) */
  effort: number;
};

/**
 * ROI assumption parameters.
 * Written by Health.tsx What-If sidebar, read by FinalReportView.tsx
 * to drive the ICE prioritization table recalculation.
 */
export type RoiParameters = {
  /** Gross margin percentage assumption (0–100) */
  marginPct: number;
  /** Analyst hours saved per week by automation */
  hoursSaved: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — CombinedAudit
// The canonical merged result returned by POST /api/audit.
// This is exactly what useDualAudit receives, stores, and what every
// downstream view (Visual, Health, Final) reads without re-computation.
// ─────────────────────────────────────────────────────────────────────────────

export type CombinedAudit = {
  // ── Pattern classification (from Gemini) ────────────────────────────────
  /** Business pattern identified (e.g. "Complex Cashflow", "High-Velocity Retail") */
  detectedPattern: string;
  /** Ordered chart IDs recommended by Gemini — drives VisualDashboard ordering */
  recommendedCharts: string[];
  /** Pattern confidence score 0.0–1.0 — shown in Health.tsx ConfidenceMeter */
  patternConfidence: number;
  /** Column-level signals from Gemini — used in Health.tsx Signal Grid */
  primarySignals: string[];

  // ── Narrative (from DeepSeek R1) ────────────────────────────────────────
  /**
   * Why this visual strategy was chosen — 3–4 sentences with column refs.
   * Shown in Health.tsx "Why this score?" reasoning accordion.
   */
  reasoning: string;
  /**
   * CFO-ready executive brief — 2–3 sentences.
   * Shown in Health.tsx Executive Briefing and FinalReportView.tsx dark panel.
   * Stored as report.aiSummary in ReportState.
   */
  executiveSummary: string;
  /**
   * Plain-string next moves from DeepSeek R1 — mapped to NextMove[] by useDualAudit.
   * The raw strings are also stored for WhatsApp share / clipboard copy.
   */
  nextMoves: string[];
  /** Risk flags detected in the dataset structure — used in Health.tsx displayRisks */
  riskFlags: string[];

  // ── Pipeline metadata ────────────────────────────────────────────────────
  /** Which providers successfully responded */
  source: AuditSource;
  /** Array of provider names that contributed (e.g. ["gemini", "deepseek-r1"]) */
  providers: string[];
  /** Unix timestamp (ms) when the audit completed — stored in StoredAudit.generatedAt */
  generatedAt: number;
};

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Background audit status
// Allows the UI to show loading states without blocking renders.
// Written by useDualAudit, read by VisualDashboard header badges.
// ─────────────────────────────────────────────────────────────────────────────

export type BackgroundAuditStatus =
  | "idle"       // Hook not yet mounted
  | "pending"    // Fetch in flight
  | "resolved"   // CombinedAudit written to store successfully
  | "partial"    // One provider failed — merged result still available
  | "failed";    // Both providers failed — heuristic fallback active

export type BackgroundAuditState = {
  status: BackgroundAuditStatus;
  /** Which provider errored, if any */
  failedProvider?: "gemini" | "openrouter" | "both";
  /** Error message for debug display — never shown to end users */
  errorMessage?: string;
  /** Timestamp of last attempt */
  lastAttemptAt?: number;
};