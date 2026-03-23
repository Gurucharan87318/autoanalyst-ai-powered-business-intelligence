import type { Dataset } from "./DatasetTypes"

export type CleanStats = {
  invalidByColumn: Record<string, number>
  castedColumns: Record<string, "number" | "date" | "text">
}

export function isNullish(v: unknown) {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "")
}

function parseNumberStrict(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v !== "string") return null
  const t = v.trim()
  if (!t) return null
  const cleaned = t.replace(/₹/g, "").replace(/,/g, "").replace(/\s+/g, "")
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function parseDateStrict(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString()
  const s = typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : ""
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

export function castColumnStrict(
  rows: Record<string, unknown>[],
  col: string,
  to: "number" | "date" | "text"
) {
  let invalid = 0

  const out = rows.map((r) => {
    const v = r[col]
    if (isNullish(v)) return { ...r, [col]: null }

    if (to === "text") return { ...r, [col]: String(v).trim() || null }

    if (to === "number") {
      const n = parseNumberStrict(v)
      if (n === null) invalid++
      return { ...r, [col]: n }
    }

    // date
    const iso = parseDateStrict(v)
    if (iso === null) invalid++
    return { ...r, [col]: iso }
  })

  return { rows: out, invalid }
}

export function autoCleanStrict(
  dataset: Dataset,
  casts: Array<{ col: string; to: "number" | "date" | "text" }> = []
) {
  const stats: CleanStats = { invalidByColumn: {}, castedColumns: {} }

  let rows: Record<string, unknown>[] = dataset.rows.map((r) => {
    const rr: Record<string, unknown> = {}
    for (const k of dataset.columns) {
      const v = (r as any)[k]
      rr[k] = isNullish(v) ? null : typeof v === "string" ? v.trim() : v
    }
    return rr
  })

  for (const c of casts) {
    const res = castColumnStrict(rows, c.col, c.to)
    rows = res.rows
    stats.invalidByColumn[c.col] = (stats.invalidByColumn[c.col] ?? 0) + res.invalid
    stats.castedColumns[c.col] = c.to
  }

  return {
    dataset: {
      ...dataset,
      rows,
      meta: {
        ...dataset.meta,
        rows: rows.length,
        cols: dataset.columns.length,
        createdAt: Date.now(),
      },
    },
    stats,
  }
}
