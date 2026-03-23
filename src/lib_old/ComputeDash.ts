import type { Dataset } from "./DatasetTypes"
import type { ChartSpec, KPI } from "./DatasetStore"
import type { Mapping } from "./Template"
import type { TemplateId } from "./TemplateDetect"

const isNullish = (v: any) => v === null || v === undefined || (typeof v === "string" && !v.trim())

const toNum = (v: any): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v !== "string") return null
  const t = v.replace(/₹/g, "").replace(/,/g, "").trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const toDate = (v: any): Date | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v
  const d = new Date(String(v ?? ""))
  return Number.isNaN(d.getTime()) ? null : d
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

function pctLabel(p: number | null, digits = 0) {
  if (p === null || !Number.isFinite(p)) return "—"
  return `${(p * 100).toFixed(digits)}%`
}

function groupSum(rows: any[], xCol: string, yCol: string, limit = 12) {
  const m = new Map<string, number>()
  for (const r of rows) {
    const x = String(r?.[xCol] ?? "").trim()
    const y = toNum(r?.[yCol])
    if (!x || y === null) continue
    m.set(x, (m.get(x) ?? 0) + y)
  }
  const arr = [...m.entries()].map(([k, v]) => ({ [xCol]: k, [yCol]: v }))
  arr.sort((a, b) => (b as any)[yCol] - (a as any)[yCol])
  return arr.slice(0, limit)
}

function groupMonthSum(rows: any[], dateCol: string, amountCol: string, limit = 18) {
  const m = new Map<string, number>()
  for (const r of rows) {
    const d = toDate(r?.[dateCol])
    const a = toNum(r?.[amountCol])
    if (!d || a === null) continue
    const k = monthKey(d)
    m.set(k, (m.get(k) ?? 0) + a)
  }
  const arr = [...m.entries()].map(([k, v]) => ({ month: k, amount: v }))
  arr.sort((a, b) => a.month.localeCompare(b.month))
  return arr.slice(Math.max(0, arr.length - limit))
}

function parsePctAmount(rows: any[], amountCol: string): number | null {
  if (!rows.length) return null
  let ok = 0
  for (const r of rows) if (toNum(r?.[amountCol]) !== null) ok++
  return ok / rows.length
}

function parsePctDate(rows: any[], dateCol: string): number | null {
  if (!rows.length) return null
  let ok = 0
  for (const r of rows) if (toDate(r?.[dateCol])) ok++
  return ok / rows.length
}

function spikeDaysTable(rows: any[], dateCol: string, amountCol: string, limit = 12) {
  const m = new Map<string, number>()
  for (const r of rows) {
    const d = toDate(r?.[dateCol])
    const a = toNum(r?.[amountCol])
    if (!d || a === null) continue
    const k = d.toISOString().slice(0, 10)
    m.set(k, (m.get(k) ?? 0) + a)
  }

  const arr = [...m.entries()].map(([day, sum]) => ({ day, sum }))
  if (arr.length < 10) return []

  arr.sort((a, b) => a.day.localeCompare(b.day))
  const vals = arr.map((x) => x.sum).sort((a, b) => a - b)

  const q = (p: number) => vals[Math.max(0, Math.min(vals.length - 1, Math.floor(p * (vals.length - 1))))]
  const p50 = q(0.5)
  const p90 = q(0.9)
  const thresh = Math.max(p90, p50 * 2)

  return arr
    .filter((x) => x.sum >= thresh)
    .sort((a, b) => b.sum - a.sum)
    .slice(0, limit)
    .map((x) => ({ Day: x.day, Amount: Math.round(x.sum) }))
}

function highAmountOutliers(rows: any[], dateCol: string | null, amountCol: string, limit = 12) {
  const nums: number[] = []
  for (const r of rows) {
    const a = toNum(r?.[amountCol])
    if (a !== null) nums.push(a)
  }
  if (nums.length < 30) return []

  nums.sort((a, b) => a - b)
  const q = (p: number) => nums[Math.max(0, Math.min(nums.length - 1, Math.floor(p * (nums.length - 1))))]
  const q1 = q(0.25)
  const q3 = q(0.75)
  const iqr = Math.max(0, q3 - q1)
  const thresh = q3 + 1.5 * iqr

  const out = rows
    .map((r) => {
      const a = toNum(r?.[amountCol])
      if (a === null || a < thresh) return null
      return {
        Date: dateCol ? String(r?.[dateCol] ?? "") : "",
        Amount: Math.round(a),
      }
    })
    .filter(Boolean) as any[]

  out.sort((a, b) => b.Amount - a.Amount)
  return out.slice(0, limit)
}

export function computeFilled(
  templateId: TemplateId,
  dataset: Dataset,
  mapping: Mapping
): { kpis: KPI[]; charts: ChartSpec[] } {
  const rows = dataset.rows ?? []
  const cols = dataset.columns ?? []

  const dateCol = mapping.dateCol && cols.includes(mapping.dateCol) ? mapping.dateCol : null
  const amountCol = mapping.amountCol && cols.includes(mapping.amountCol) ? mapping.amountCol : null
  const debitCol = mapping.debitCol && cols.includes(mapping.debitCol) ? mapping.debitCol : null
  const creditCol = mapping.creditCol && cols.includes(mapping.creditCol) ? mapping.creditCol : null
  const balanceCol = mapping.balanceCol && cols.includes(mapping.balanceCol) ? mapping.balanceCol : null
  const customerCol = mapping.customerCol && cols.includes(mapping.customerCol) ? mapping.customerCol : null
  const itemCol = mapping.itemCol && cols.includes(mapping.itemCol) ? mapping.itemCol : null
  const gstinCol = mapping.gstinCol && cols.includes(mapping.gstinCol) ? mapping.gstinCol : null

  // totals
  let total = 0
  let numericRowCount = 0
  if (amountCol) {
    for (const r of rows) {
      const n = toNum(r?.[amountCol])
      if (n === null) continue
      total += n
      numericRowCount++
    }
  }

  // parse quality KPIs
  const parseAmount = amountCol ? parsePctAmount(rows, amountCol) : null
  const parseDate = dateCol ? parsePctDate(rows, dateCol) : null

  // concentration (Top 1 / Top 5)
  let top1: number | null = null
  let top5: number | null = null
  if (customerCol && amountCol && total > 0) {
    const m = new Map<string, number>()
    for (const r of rows) {
      const c = String(r?.[customerCol] ?? "").trim()
      const a = toNum(r?.[amountCol])
      if (!c || a === null) continue
      m.set(c, (m.get(c) ?? 0) + a)
    }
    const arr = [...m.entries()].map(([name, value]) => ({ name, value }))
    arr.sort((a, b) => b.value - a.value)
    top1 = arr.length ? clamp01(arr[0].value / total) : null
    top5 = clamp01(arr.slice(0, 5).reduce((s, x) => s + x.value, 0) / total)
  }

  // GST readiness
  let missingGSTIN: number | null = null
  if (gstinCol) {
    let miss = 0
    for (const r of rows) if (isNullish(r?.[gstinCol])) miss++
    missingGSTIN = miss
  }

  const kpis: KPI[] = [
    { label: "TOTAL ROWS", value: String(rows.length), hint: dataset.meta?.name ?? "" },
    {
      label: "TOTAL SALES",
      value: amountCol ? total.toLocaleString("en-IN") : "—",
      hint: amountCol ? `Column: ${amountCol}` : "Amount column not found",
    },
    {
      label: "AVG ORDER",
      value: numericRowCount ? Math.round(total / Math.max(1, numericRowCount)).toLocaleString("en-IN") : "—",
      hint: numericRowCount ? "Approx per numeric row" : "",
    },

    { label: "DATA PARSE AMOUNT", value: pctLabel(parseAmount, 0), hint: amountCol ? `Column: ${amountCol}` : "Amount column not found" },
    { label: "DATA PARSE DATE", value: pctLabel(parseDate, 0), hint: dateCol ? `Column: ${dateCol}` : "Date column not found" },

    { label: "TOP CUSTOMER SHARE", value: top1 === null ? "—" : pctLabel(top1, 1), hint: customerCol ? "Top customer share of sales" : "Customer column not found" },
    { label: "TOP 5 SHARE", value: top5 === null ? "—" : pctLabel(top5, 1), hint: customerCol ? "Top 5 customers share of sales" : "Customer column not found" },

    {
      label: "GST READY",
      value: gstinCol ? (missingGSTIN === 0 ? "Good" : "Check") : "Unknown",
      hint: gstinCol ? `Missing GSTIN: ${missingGSTIN}` : "GSTIN column not found",
    },
  ]

  const charts: ChartSpec[] = []

  if (dateCol && amountCol) {
    charts.push({
      kind: "line",
      title: "Sales by Month",
      xKey: "month",
      yKey: "amount",
      data: groupMonthSum(rows, dateCol, amountCol),
    })

    const spikes = spikeDaysTable(rows, dateCol, amountCol, 12)
    if (spikes.length) {
      charts.push({
        kind: "table",
        title: "Spike Days",
        columns: ["Day", "Amount"],
        rows: spikes,
      })
    }

    const outliers = highAmountOutliers(rows, dateCol, amountCol, 12)
    if (outliers.length) {
      charts.push({
        kind: "table",
        title: "High Amount Outliers",
        columns: ["Date", "Amount"],
        rows: outliers,
      })
    }
  }

  if (customerCol && amountCol) {
    charts.push({
      kind: "bar",
      title: "Top Customers",
      xKey: customerCol,
      yKey: amountCol,
      data: groupSum(rows, customerCol, amountCol, 10),
    })
  }

  if (itemCol && amountCol) {
    charts.push({
      kind: "bar",
      title: "Top Items",
      xKey: itemCol,
      yKey: amountCol,
      data: groupSum(rows, itemCol, amountCol, 10),
    })
  }

  // Bank statement extras
  if (templateId === "bankstatement" && dateCol && (debitCol || creditCol)) {
    if (debitCol) {
      charts.push({
        kind: "line",
        title: "Debits by Month",
        xKey: "month",
        yKey: "debit",
        data: groupMonthSum(rows, dateCol, debitCol).map((r) => ({ month: r.month, debit: r.amount })),
      })
    }
    if (creditCol) {
      charts.push({
        kind: "line",
        title: "Credits by Month",
        xKey: "month",
        yKey: "credit",
        data: groupMonthSum(rows, dateCol, creditCol).map((r) => ({ month: r.month, credit: r.amount })),
      })
    }
    if (balanceCol) {
      charts.push({
        kind: "table",
        title: "Recent Balance Snapshot",
        columns: [dateCol, balanceCol],
        rows: rows.slice(0, 30).map((r) => ({ [dateCol]: r?.[dateCol], [balanceCol]: r?.[balanceCol] })),
      })
    }
  }

  return { kpis: kpis.slice(0, 12), charts: charts.slice(0, 10) }
}
