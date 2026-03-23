import { useEffect, useRef } from "react";
import { datasetStore, useDatasetStore } from "../src/lib_old/DatasetStore";
import type { CombinedAudit, NextMove } from "../src/types/AuditTypes";

function toNextMoves(strings: string[]): NextMove[] {
  return strings.map((s) => ({
    title: s.replace(/^\d+\.\s*/, "").trim(),
    why: "AI recommendation — OpenRouter dual-slot audit (structured routing + narrative).",
    impact: 7,
    confidence: 0.72,
    effort: 4,
  }));
}

export function useDualAudit() {
  const { dataset } = useDatasetStore();
  const hasRun = useRef(false);

  const datasetId = [
    dataset?.meta?.name ?? "",
    dataset?.columns?.length ?? 0,
    dataset?.rows?.length ?? 0,
  ].join("|");

  useEffect(() => {
    if (!dataset?.columns?.length) return;
    if (hasRun.current) return;

    const existingAudit = datasetStore.get().dashboard?.audit;
    if (existingAudit?.source === "merged") {
      console.info("[DualAudit] Merged audit already in store — skipping.");
      return;
    }

    const currentDataset = dataset;
    hasRun.current = true;

    async function run() {
      try {
        const state = datasetStore.get();

        const res = await fetch("/api/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            columns: currentDataset.columns,
            sampleRows: (currentDataset.rows ?? []).slice(0, 10),
            rowCount: currentDataset.rows?.length,
            datasetName: currentDataset.meta?.name,
            detectedPattern: state.dashboard?.audit?.detectedPattern,
          }),
        });

        if (!res.ok) {
          const msg = `[DualAudit] /api/audit returned HTTP ${res.status}`;
          console.error(msg);
          return;
        }

        const audit = (await res.json()) as CombinedAudit;

        if (!audit.detectedPattern || !audit.source) {
          console.error("[DualAudit] Malformed response from /api/audit:", audit);
          return;
        }

        const mappedNextMoves = toNextMoves(audit.nextMoves ?? []);
        datasetStore.setAudit(audit, mappedNextMoves);

        console.info(
          `[DualAudit] ✓ Complete` +
            ` | source: ${audit.source}` +
            ` | providers: ${audit.providers.join(" + ")}` +
            ` | pattern: ${audit.detectedPattern}` +
            ` | confidence: ${Math.round((audit.patternConfidence ?? 0) * 100)}%`
        );
      } catch (err) {
        console.warn(
          "[DualAudit] Network/fetch error — heuristics remain active:",
          (err as Error).message
        );
        hasRun.current = false;
      }
    }

    void run();
  }, [datasetId]);
}
