import React from "react";
import { Loader2, Sparkles, AlertCircle, Home } from "lucide-react";

import { usePipelineStore } from "@/store/usePipelineStore";
import CategoryBarChart from "./CategoryBarChart";
import TrendChart from "./TrendChart";

function KpiCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}

function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
          />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-[340px] animate-pulse rounded-xl border border-slate-200 bg-white" />
        <div className="h-[340px] animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    </div>
  );
}

export default function DashboardView(): React.JSX.Element {
  const kpiData = usePipelineStore((s) => s.kpiData);
  const chartData = usePipelineStore((s) => s.chartData);
  const aiSummary = usePipelineStore((s) => s.aiSummary);
  const isGeneratingLocalData = usePipelineStore((s) => s.isGeneratingLocalData);
  const isFetchingAI = usePipelineStore((s) => s.isFetchingAI);
  const localError = usePipelineStore((s) => s.localError);
  const setBackToLanding = usePipelineStore((s) => s.setBackToLanding);

  if (isGeneratingLocalData) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-8 font-sans">
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Building your dashboard
              </h1>
              <p className="text-sm text-slate-500">
                Running local analysis and preparing visual outputs.
              </p>
            </div>
          </div>
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  if (localError) {
    return (
      <div className="min-h-screen bg-slate-50 px-6 py-8 font-sans">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl border border-rose-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-rose-500" />
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Dashboard generation failed
                </h2>
                <p className="mt-1 text-sm text-slate-600">{localError}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const categoryCount = chartData?.categories?.length ?? 0;
  const trendCount = chartData?.trend?.length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 px-6 py-8 font-sans">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              AutoAnalyst Dashboard
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Your local-first business intelligence view is ready.
            </p>
          </div>

          <button
            type="button"
            onClick={setBackToLanding}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:shadow-sm"
          >
            <Home className="h-4 w-4" />
            Home
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard
            title="Rows Processed"
            value={String((kpiData as any)?.rowCount ?? "—")}
            hint="Local processing result"
          />
          <KpiCard
            title="Total Revenue"
            value={String((kpiData as any)?.totalRevenue ?? "—")}
            hint="Detected from your metric columns"
          />
          <KpiCard
            title="Visual Outputs"
            value={String(categoryCount + trendCount)}
            hint="Charts available in this dashboard"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <TrendChart />
          <CategoryBarChart />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            <h3 className="text-sm font-semibold text-slate-900">AI Summary</h3>
          </div>

          {isFetchingAI ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating business summary...
            </div>
          ) : aiSummary ? (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {typeof aiSummary === "string"
                ? aiSummary
                : JSON.stringify(aiSummary, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-slate-500">
              No AI summary available yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
