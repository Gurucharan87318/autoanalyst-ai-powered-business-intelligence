import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import {
  FileSpreadsheet,
  Sparkles,
  Table2,
  BarChart3,
  HeartPulse,
  RotateCcw,
  ArrowRight,
  Home,
  Flag,
  CheckCircle2,
  Lock,
  Database,
} from "lucide-react"

import { Button } from "../components/ui/button"
import { Badge } from "../components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card"
import { Separator } from "../components/ui/separator"

import GuidedTour from "./GuidedTour"
import { useDatasetStore, datasetStore } from "../lib_old/DatasetStore"

type TransformMode = "ai-auto" | "sql-manual"

const LS_LAST_ROUTE = "aa_last_route"
const LS_MODE = "aa_transform_mode"

function setLastRoute(path: string) {
  try {
    localStorage.setItem(LS_LAST_ROUTE, path)
  } catch {}
}

function getLastRoute(): string | null {
  try {
    return localStorage.getItem(LS_LAST_ROUTE)
  } catch {
    return null
  }
}

function getSavedMode(): TransformMode {
  try {
    const v = localStorage.getItem(LS_MODE)
    return v === "sql-manual" ? "sql-manual" : "ai-auto"
  } catch {
    return "ai-auto"
  }
}

function saveMode(m: TransformMode) {
  try {
    localStorage.setItem(LS_MODE, m)
  } catch {}
}

function clearTourKeys(prefix = "tour:") {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(prefix)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {}
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

function pct(n: number, d: number) {
  if (!d) return 0
  return n / d
}

function progressTone(p: number) {
  if (p >= 0.85) return "bg-[#2185fb]"
  if (p >= 0.55) return "bg-[#7cb5ec]"
  return "bg-slate-700"
}

export default function Welcome() {
  const nav = useNavigate()
  const { dataset, profiles, dashboard, report } = useDatasetStore() as any

  const hasData = !!dataset
  const hasSchema = !!(profiles && profiles.length)
  const hasVisual = !!(dashboard && (dashboard.kpis?.length || dashboard.charts?.length))
  const hasHealth = !!(report && ((report.alerts && report.alerts.length) || (report.nextMoves && report.nextMoves.length) || report.aiSummary))
  const hasGST = !!(report && report.gst)

  const [mode, setMode] = useState<TransformMode>(() => getSavedMode())
  const [lastRoute, setLastRouteState] = useState<string | null>(() => getLastRoute())

  useEffect(() => {
    setLastRouteState(getLastRoute())
  }, [])

  const steps = useMemo(() => {
    return [
      {
        id: "upload",
        title: "Upload data",
        desc: "Import Tally or Zoho exports, Excel, or CSV. Auto-clean and mapping memory reduce repeat work.",
        icon: FileSpreadsheet,
        path: "/app/upload",
        ready: true,
        done: hasData,
      },
      {
        id: "transform",
        title: "Schema detection",
        desc:
          mode === "ai-auto"
            ? "AI Auto-clean lane: schema detection and profiling, then move into visuals."
            : "SQL Manual lane: use SQL Sandbox for full control while keeping the fast lane available.",
        icon: mode === "ai-auto" ? Sparkles : Table2,
        path: "/feature/schema-detection",
        ready: hasData,
        done: hasSchema,
      },
      {
        id: "visualize",
        title: "Visualize",
        desc: "Generate KPIs and charts. These feed Health and Final reporting.",
        icon: BarChart3,
        path: "/feature/visual-dashboard",
        ready: hasData && hasSchema,
        done: hasVisual,
      },
      {
        id: "health",
        title: "Health check",
        desc: "Review vitals, alerts, diagnosis, and next actions before final packaging.",
        icon: HeartPulse,
        path: "/feature/retail-health",
        ready: hasData,
        done: hasHealth,
      },
      {
        id: "final",
        title: "Final report",
        desc: "Open the board-pack view and prepare exports for presentation or handoff.",
        icon: Flag,
        path: "/feature/final-dashboard",
        ready: hasData,
        done: false,
      },
    ] as const
  }, [hasData, hasSchema, hasVisual, hasHealth, hasGST, mode])

  const currentStepIndex = useMemo(() => {
    const firstNotDone = steps.findIndex((s) => s.ready && !s.done)
    if (firstNotDone !== -1) return firstNotDone
    const firstLocked = steps.findIndex((s) => !s.ready)
    if (firstLocked !== -1) return Math.max(0, firstLocked - 1)
    return steps.length - 1
  }, [steps])

  const completion = useMemo(() => {
    const readySteps = steps.filter((s) => s.ready)
    const doneCount = readySteps.filter((s) => s.done).length
    const ratio = pct(doneCount, Math.max(1, readySteps.length))
    return { doneCount, total: readySteps.length, ratio }
  }, [steps])

  const tourSteps = useMemo(() => {
    return [
      {
        id: "w1",
        title: "Fast lane workflow",
        body: "Follow Upload → Schema → Visual → Health → Final. This tracks progress step by step.",
        anchorId: "welcome-flow",
        placement: "bottom" as const,
      },
      {
        id: "w2",
        title: "Transform mode",
        body: "Let you Auto-clean faster. SQL Sandbox is for power users who want manual control.",
        anchorId: "welcome-mode",
        placement: "bottom" as const,
      },
      {
        id: "w3",
        title: "Resume and continue",
        body: "Resume returns to the last screen. Continue opens the next step in the workflow.",
        anchorId: "welcome-actions",
        placement: "bottom" as const,
      },
    ]
  }, [])

  const go = (path: string) => {
    setLastRoute(path)
    setLastRouteState(path)
    nav(path)
  }

  const resetLocal = () => {
    try {
      localStorage.removeItem(LS_LAST_ROUTE)
      localStorage.removeItem(LS_MODE)
    } catch {}
    clearTourKeys()
    datasetStore.set({
      baseDataset: null,
      dataset: null,
      profiles: null,
      dashboard: null,
      transforms: [],
      transformMode: null,
      report: null,
    })
    window.location.reload()
  }
return (
  <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
    <GuidedTour tourKey="welcome-v2" steps={tourSteps} />

    {/* ── Hero Header ─────────────────────────────────────────────────── */}
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              Workflow Home
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-900">
              AutoAnalyst
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-500">
              Move from file upload to board-pack using one consistent workflow across
              schema, visuals, health, and final reporting.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Public beta
              </span>
              <span className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                Fast lane workflow
              </span>
              {dataset?.meta?.name && (
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                  <Database className="h-3 w-3" />
                  {dataset.meta.name}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2" id="welcome-actions">
            <Button variant="outline" onClick={() => nav("/")}>
              <Home className="mr-2 h-4 w-4" />
              Home
            </Button>
            <Button
              className="bg-slate-900 text-white hover:bg-slate-800"
              onClick={() => nav("/app/upload")}
            >
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <div className="mx-auto max-w-7xl px-6 py-8 space-y-6" id="welcome-flow">

      {/* ── Progress Card ──────────────────────────────────────────────── */}
      <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
                Timeline Progress
              </p>
              <CardTitle className="mt-1 text-base font-semibold tracking-tight text-slate-900">
                Workflow completion
              </CardTitle>
              <CardDescription className="mt-0.5 text-sm text-slate-500">
                Track progress and jump into the next recommended step.
              </CardDescription>
            </div>
            <span className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {completion.doneCount} / {completion.total} complete
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-1.5 rounded-full transition-all ${progressTone(completion.ratio)}`}
              style={{ width: `${Math.round(clamp01(completion.ratio) * 100)}%` }}
            />
          </div>
          <p className="text-sm text-slate-500">
            Next step:{" "}
            <span className="font-semibold text-slate-900">
              {steps[currentStepIndex]?.title}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* ── Transform Mode Card ────────────────────────────────────────── */}
      <Card className="rounded-xl border border-slate-200 bg-white shadow-sm" id="welcome-mode">
        <CardHeader className="pb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Configuration
          </p>
          <CardTitle className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            Transform mode
          </CardTitle>
          <CardDescription className="mt-0.5 text-sm text-slate-500">
            Pick the workflow mode before beginning.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={mode === "ai-auto" ? "default" : "outline"}
            className={mode === "ai-auto" ? "bg-slate-900 text-white hover:bg-slate-800" : ""}
            onClick={() => { setMode("ai-auto"); saveMode("ai-auto"); }}
          >
            Auto-clean
          </Button>
          <Button
            variant={mode === "sql-manual" ? "default" : "outline"}
            className={mode === "sql-manual" ? "bg-slate-900 text-white hover:bg-slate-800" : ""}
            onClick={() => { setMode("sql-manual"); saveMode("sql-manual"); }}
          >
            SQL sandbox (V2)
          </Button>
          <Button variant="outline" onClick={() => nav("/pricing")}>
            Pricing
          </Button>
        </CardContent>
      </Card>

      {/* ── Workflow Timeline ──────────────────────────────────────────── */}
      <Card className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Pipeline
          </p>
          <CardTitle className="mt-1 text-base font-semibold tracking-tight text-slate-900">
            Workflow timeline
          </CardTitle>
          <CardDescription className="mt-0.5 text-sm text-slate-500">
            Open each step, review progress, and continue through the reporting pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Separator />
          {steps.map((s, idx) => {
            const isCurrent = idx === currentStepIndex;
            const isLocked  = !s.ready;
            const Icon      = s.icon;

            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, delay: idx * 0.04 }}
                className={[
                  "rounded-xl border p-5 transition-all",
                  isCurrent
                    ? "border-slate-900 bg-slate-900 text-white shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm",
                ].join(" ")}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {/* Icon box */}
                    <div className={[
                      "mt-0.5 rounded-lg border p-2.5",
                      isCurrent
                        ? "border-white/10 bg-white/10"
                        : "border-slate-200 bg-slate-50",
                    ].join(" ")}>
                      <Icon className={["h-4 w-4", isCurrent ? "text-white" : "text-slate-600"].join(" ")} />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={[
                          "text-sm font-semibold",
                          isCurrent ? "text-white" : "text-slate-900",
                        ].join(" ")}>
                          {s.title}
                        </span>

                        {s.done && (
                          <span className={[
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            isCurrent
                              ? "bg-white/10 text-white"
                              : "border border-emerald-200 bg-emerald-50 text-emerald-700",
                          ].join(" ")}>
                            <CheckCircle2 className="h-3 w-3" />
                            Done
                          </span>
                        )}

                        {isCurrent && !s.done && (
                          <span className="inline-flex items-center rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-900">
                            Next
                          </span>
                        )}

                        {isLocked && (
                          <span className={[
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
                            isCurrent
                              ? "bg-white/10 text-white"
                              : "border border-slate-200 bg-slate-100 text-slate-500",
                          ].join(" ")}>
                            <Lock className="h-3 w-3" />
                            Locked
                          </span>
                        )}
                      </div>

                      <p className={[
                        "mt-1 text-sm",
                        isCurrent ? "text-slate-300" : "text-slate-500",
                      ].join(" ")}>
                        {s.desc}
                      </p>

                      {s.id === "transform" && !hasSchema && hasData && (
                        <p className={[
                          "mt-1.5 text-xs",
                          isCurrent ? "text-slate-400" : "text-slate-400",
                        ].join(" ")}>
                          Tip: Schema Detection is the gate that unlocks advanced visuals.
                        </p>
                      )}
                    </div>
                  </div>

                  <Button
                    disabled={isLocked}
                    onClick={() => go(s.path)}
                    size="sm"
                    className={
                      isCurrent
                        ? "bg-white text-slate-900 hover:bg-slate-100"
                        : s.done
                          ? "bg-slate-900 text-white hover:bg-slate-800"
                          : "bg-slate-900 text-white hover:bg-slate-800"
                    }
                  >
                    {s.done ? "Review" : "Open"}
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-6 pb-10">
        <Button variant="outline" onClick={resetLocal}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset timeline
        </Button>
        <p className="text-xs text-slate-400">
          Progress is stored on this device, including last route and selected transform mode.
        </p>
      </div>

    </div>
  </div>
);
}