// components/dashboard/AIInsightCard.tsx
import React, { useMemo } from "react";
import { CheckCircle2 } from "lucide-react";
import { usePipelineStore } from "@/store/usePipelineStore";
import type { ExecutiveSummary } from "@/lib/aiService";

function Card({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 font-sans">
      {children}
    </div>
  );
}

function Skeleton(): React.JSX.Element {
  return (
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-40 rounded bg-slate-100" />
      <div className="h-3 w-full rounded bg-slate-100" />
      <div className="h-3 w-11/12 rounded bg-slate-100" />
      <div className="h-3 w-10/12 rounded bg-slate-100" />
      <div className="h-4 w-28 rounded bg-slate-100 pt-3" />
      <div className="h-3 w-9/12 rounded bg-slate-100" />
      <div className="h-3 w-8/12 rounded bg-slate-100" />
      <div className="h-3 w-10/12 rounded bg-slate-100" />
      <div className="h-10 w-full rounded bg-indigo-50 ring-1 ring-indigo-100" />
    </div>
  );
}

export function AIInsightCard(): React.JSX.Element {
  const isFetchingAI = usePipelineStore((s: { isFetchingAI: any; }) => s.isFetchingAI);
  const aiSummary = usePipelineStore((s: { aiSummary: any; }) => s.aiSummary);

  const parsed = useMemo<ExecutiveSummary | null>(() => {
    if (!aiSummary) return null;
    return aiSummary;
  }, [aiSummary]);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold text-slate-500">AI Executive Summary</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            Business insights (no raw rows sent)
          </div>
        </div>
        <div className="text-xs text-slate-500">{isFetchingAI ? "Generating…" : "Ready"}</div>
      </div>

      {isFetchingAI ? (
        <Skeleton />
      ) : parsed ? (
        <div className="space-y-4">
          <p className="text-sm leading-6 text-slate-700">{parsed.summary}</p>

          <div>
            <div className="text-xs font-semibold text-slate-500">Key drivers</div>
            <ul className="mt-2 space-y-2">
              {parsed.key_drivers.map((d, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-teal-600" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-3">
            <div className="text-xs font-semibold text-indigo-900">Recommended action</div>
            <div className="mt-1 text-sm text-indigo-900/90">{parsed.recommended_action}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-slate-600">
          No AI summary available yet. Generate the dashboard to request insights.
        </div>
      )}
    </Card>
  );
}
