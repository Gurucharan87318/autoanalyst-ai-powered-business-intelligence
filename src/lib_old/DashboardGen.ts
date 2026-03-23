import type { ColumnProfile, Dataset } from './DatasetTypes'
import type { DashboardState, KPI, ChartSpec } from './DatasetStore'

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (abs >= 1_000) return (n / 1_000).toFixed(2) + 'K'
  return n.toFixed(2)
}

function isNullish(v: unknown) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

function pickBestMetric(profiles: ColumnProfile[]) {
  const candidates = profiles.filter(p => p.inferredType === 'number')
  const prefer = ['revenue', 'sales', 'amount', 'profit', 'gmv', 'value', 'price', 'cost']
  const byName = (a: ColumnProfile, b: ColumnProfile) => {
    const an = a.name.toLowerCase(), bn = b.name.toLowerCase()
    const as = prefer.findIndex(k => an.includes(k))
    const bs = prefer.findIndex(k => bn.includes(k))
    if (as !== bs) return (as === -1 ? 999 : as) - (bs === -1 ? 999 : bs)
    // fallback: fewer nulls
    return a.nullPct - b.nullPct
  }
  return candidates.sort(byName)[0]?.name ?? null
}

function pickBestTime(profiles: ColumnProfile[]) {
  const p = profiles.find(x => x.inferredType === 'date')
  return p?.name ?? null
}

function pickBestSegment(profiles: ColumnProfile[], metric?: string | null) {
  // choose a string column with reasonable cardinality
  const candidates = profiles
    .filter(p => p.inferredType === 'string' && p.name !== metric)
    .filter(p => p.cardinality > 0.01 && p.cardinality < 0.35) // not too unique
    .sort((a, b) => a.cardinality - b.cardinality)
  return candidates[0]?.name ?? null
}

function sum(rows: Record<string, unknown>[], key: string) {
  let s = 0
  let c = 0
  for (const r of rows) {
    const v = r[key]
    if (typeof v === 'number' && Number.isFinite(v)) { s += v; c++ }
  }
  return { sum: s, count: c }
}

function groupSumTopN(rows: Record<string, unknown>[], groupKey: string, metricKey: string, n = 8) {
  const map = new Map<string, number>()
  for (const r of rows) {
    const g = r[groupKey]
    const m = r[metricKey]
    if (isNullish(g)) continue
    if (typeof m !== 'number' || !Number.isFinite(m)) continue
    const k = String(g)
    map.set(k, (map.get(k) ?? 0) + m)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ [groupKey]: k, [metricKey]: v }))
}

function timeSeriesMonthly(rows: Record<string, unknown>[], timeKey: string, metricKey: string) {
  const map = new Map<string, number>()
  for (const r of rows) {
    const t = r[timeKey]
    const m = r[metricKey]
    if (isNullish(t)) continue
    if (typeof m !== 'number' || !Number.isFinite(m)) continue
    const d = new Date(String(t))
    if (Number.isNaN(d.getTime())) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    map.set(key, (map.get(key) ?? 0) + m)
  }
  return Array.from(map.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => ({ [timeKey]: k, [metricKey]: v }))
}

export function generateDashboard(
  dataset: Dataset,
  profiles: ColumnProfile[],
  userPick?: { metric?: string | null; segment?: string | null; time?: string | null }
): DashboardState {
  const metric = userPick?.metric ?? pickBestMetric(profiles)
  const time = userPick?.time ?? pickBestTime(profiles)
  const segment = userPick?.segment ?? pickBestSegment(profiles, metric)

  const rows = dataset.rows
  const kpis: KPI[] = []
  const charts: ChartSpec[] = []

  kpis.push({ label: 'Rows', value: String(dataset.meta.rows) })
  kpis.push({ label: 'Columns', value: String(dataset.meta.cols) })

  if (metric) {
    const s = sum(rows, metric)
    kpis.push({ label: `Total ${metric}`, value: fmt(s.sum) })
    if (s.count) kpis.push({ label: `Avg ${metric}`, value: fmt(s.sum / s.count) })
  }

  if (metric && segment) {
    charts.push({
      kind: 'bar',
      title: `${metric} by ${segment}`,
      xKey: segment,
      yKey: metric,
      data: groupSumTopN(rows, segment, metric, 8),
    })
    charts.push({
      kind: 'table',
      title: `Top ${segment} by ${metric}`,
      columns: [segment, metric],
      rows: groupSumTopN(rows, segment, metric, 12),
    })
  }

  if (metric && time) {
    const ts = timeSeriesMonthly(rows, time, metric)
    if (ts.length >= 3) {
      charts.push({
        kind: 'line',
        title: `${metric} trend (monthly)`,
        xKey: time,
        yKey: metric,
        data: ts,
      })
    }
  }

  return {
    metric,
    segment,
    time,
    kpis,
    charts,
    generatedAt: Date.now(),
  }
}
