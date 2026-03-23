import type { Dataset } from "./DatasetTypes"

type Reply =
  | { kind: "text"; text: string }
  | { kind: "table"; title: string; columns: string[]; rows: any[] }

function isNullish(v: unknown) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "")
}

function groupSumTopN(rows: Record<string, unknown>[], groupKey: string, metricKey: string, n = 10) {
  const map = new Map<string, number>()
  for (const r of rows) {
    const g = r[groupKey]
    const m = r[metricKey]
    if (isNullish(g)) continue
    if (typeof m !== "number" || !Number.isFinite(m)) continue
    const k = String(g)
    map.set(k, (map.get(k) ?? 0) + m)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ [groupKey]: k, [metricKey]: v }))
}

function sum(rows: Record<string, unknown>[], key: string) {
  let s = 0
  let c = 0
  for (const r of rows) {
    const v = r[key]
    if (typeof v === "number" && Number.isFinite(v)) {
      s += v
      c++
    }
  }
  return { sum: s, count: c }
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ")
}

function bestCol(columns: string[], needle: string) {
  const n = norm(needle)
  const exact = columns.find((c) => norm(c) === n)
  if (exact) return exact
  const includes = columns.find((c) => norm(c).includes(n))
  if (includes) return includes
  // small alias mapping
  const alias: Record<string, string[]> = {
    revenue: ["amount", "total", "sales", "value", "net", "grand total"],
    customer: ["party", "client", "buyer", "customer name", "ledger"],
    region: ["state", "place", "city", "area", "location"],
    date: ["invoice date", "bill date", "txn date", "transaction date"],
  }
  const keys = alias[n]
  if (keys?.length) {
    for (const k of keys) {
      const hit = columns.find((c) => norm(c).includes(k))
      if (hit) return hit
    }
  }
  return null
}

function helpText(): string {
  return [
    "AutoAnalyst (Offline Help)",
    "",
    "Fast lane workflow:",
    "1) Upload → import CSV/Excel exports",
    "2) Schema Detection → types, nulls, profiling",
    "3) Visual Dashboard → KPIs + charts",
    "4) Retail Health → alerts + next actions",
    "5) Final Dashboard → board-pack + exports",
    "",
    "Offline data questions supported:",
    '- "total <metric>"',
    '- "avg <metric>"',
    '- "top <N> <segment> by <metric>"',
    "",
    'Examples (replace with your column names): "total amount", "avg total", "top 10 customer by amount".',
  ].join("\n")
}

export function offlineAsk(dataset: Dataset, q: string): Reply[] {
  const question = norm(q)
  const cols = dataset.columns ?? []

  // --- Product / help intents (offline) ---
  if (
    question === "help" ||
    question.includes("what does autoanalyst do") ||
    question.includes("autoanalyst workflow") ||
    question.includes("workflow") ||
    question.includes("features")
  ) {
    return [{ kind: "text", text: helpText() }]
  }

  if (question.includes("upload")) {
    return [
      {
        kind: "text",
        text:
          "Upload: Go to Universal Upload → select CSV/XLSX export → we auto-clean and store it locally.\nNext: run Schema Detection for better typing and profiling.",
      },
    ]
  }

  if (question.includes("schema")) {
    return [
      {
        kind: "text",
        text:
          "Schema Detection: Profiles columns (type, null %, unique counts, samples). This improves KPI accuracy + unlocks better visuals and health alerts.",
      },
    ]
  }

  if (question.includes("visual")) {
    return [
      {
        kind: "text",
        text:
          "Visual Dashboard: Generates KPIs + charts (trend, segments, top lists, anomalies) from your detected schema. Best after Schema Detection.",
      },
    ]
  }

  if (question.includes("health")) {
    return [
      {
        kind: "text",
        text:
          "Retail Health: Rules-first checks + ops alerts (data quality, concentration risk, spikes/outliers) and next actions you can execute weekly.",
      },
    ]
  }

  if (question.includes("final") || question.includes("report") || question.includes("export")) {
    return [
      {
        kind: "text",
        text:
          "Final Dashboard: Board-pack layout + exports (PNG/JSON/PDF). Uses your Visual + Health outputs to present a clean summary.",
      },
    ]
  }

  if (question.includes("gst")) {
    return [
      {
        kind: "text",
        text:
          "GST Preview: Integrity checks and GST readiness signals. Helps with review workflows before filing.",
      },
    ]
  }

  // --- Dataset NLQ MVP grammar ---
  // "total <metric>"
  // "avg <metric>"
  // "top <N> <segment> by <metric>"
  const totalMatch = question.match(/^total\s+(.+)$/)
  if (totalMatch) {
    const metricNeedle = totalMatch[1]
    const metric = bestCol(cols, metricNeedle)
    if (!metric) return [{ kind: "text", text: `I couldn't find a column matching "${metricNeedle}".` }]
    const r = sum(dataset.rows, metric)
    return [{ kind: "text", text: `Total ${metric}: ${r.sum.toFixed(2)}` }]
  }

  const avgMatch = question.match(/^avg\s+(.+)$/)
  if (avgMatch) {
    const metricNeedle = avgMatch[1]
    const metric = bestCol(cols, metricNeedle)
    if (!metric) return [{ kind: "text", text: `I couldn't find a column matching "${metricNeedle}".` }]
    const r = sum(dataset.rows, metric)
    if (!r.count) return [{ kind: "text", text: `No numeric values found for ${metric}.` }]
    return [{ kind: "text", text: `Average ${metric}: ${(r.sum / r.count).toFixed(2)}` }]
  }

  const topMatch = question.match(/^top\s+(\d+)\s+(.+)\s+by\s+(.+)$/)
  if (topMatch) {
    const n = Number(topMatch[1])
    const segNeedle = topMatch[2]
    const metricNeedle = topMatch[3]

    const seg = bestCol(cols, segNeedle)
    const metric = bestCol(cols, metricNeedle)

    if (!seg || !metric) {
      return [
        {
          kind: "text",
          text:
            "I couldn't map your segment/metric to columns.\n" +
            `Segment tried: "${segNeedle}", metric tried: "${metricNeedle}".\n` +
            `Tip: use exact column names from your dataset.`,
        },
      ]
    }

    const rows = groupSumTopN(dataset.rows, seg, metric, Number.isFinite(n) ? n : 10)
    return [
      {
        kind: "table",
        title: `Top ${Number.isFinite(n) ? n : 10} ${seg} by ${metric}`,
        columns: [seg, metric],
        rows,
      },
    ]
  }

  // --- New fallback (NO revenue examples) ---
  return [
    {
      kind: "text",
      text:
        "I can help with:\n" +
        "- Product: workflow, upload, schema, visual, health, final, gst\n" +
        "- Data (offline): total <metric>, avg <metric>, top <N> <segment> by <metric>\n\n" +
        'Try: "help" or "workflow".',
    },
  ]
}
