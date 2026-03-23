import type { Dataset } from "./DatasetTypes"
import type { TransformOp } from "./DatasetStore"
import { castColumnStrict, isNullish } from "./AutoClean"

export function applyTransform(base: Dataset, op: TransformOp): Dataset {
  if (op.kind === "select") {
    const cols = op.columns.filter((c) => base.columns.includes(c))
    const rows = base.rows.map((r) => {
      const rr: Record<string, unknown> = {}
      for (const c of cols) rr[c] = (r as any)[c]
      return rr
    })
    return { ...base, columns: cols, rows, meta: { ...base.meta, rows: rows.length, cols: cols.length, createdAt: Date.now() } }
  }

  if (op.kind === "delete") {
    const del = new Set(op.columns)
    const cols = base.columns.filter((c) => !del.has(c))
    const rows = base.rows.map((r) => {
      const rr: Record<string, unknown> = {}
      for (const c of cols) rr[c] = (r as any)[c]
      return rr
    })
    return { ...base, columns: cols, rows, meta: { ...base.meta, rows: rows.length, cols: cols.length, createdAt: Date.now() } }
  }

  if (op.kind === "rename") {
    if (!base.columns.includes(op.from)) return base
    const cols = base.columns.map((c) => (c === op.from ? op.to : c))
    const rows = base.rows.map((r) => {
      const rr: Record<string, unknown> = { ...(r as any) }
      rr[op.to] = rr[op.from]
      delete rr[op.from]
      return rr
    })
    return { ...base, columns: cols, rows, meta: { ...base.meta, createdAt: Date.now() } }
  }

  if (op.kind === "filter") {
    const c = op.column
    const rows = base.rows.filter((r) => {
      const v = (r as any)[c]
      if (op.op === "isNull") return isNullish(v)
      if (op.op === "notNull") return !isNullish(v)

      const s = v == null ? "" : String(v)
      const val = op.value ?? ""

      if (op.op === "contains") return s.toLowerCase().includes(val.toLowerCase())
      if (op.op === "equals") return s.trim() === val.trim()

      const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""))
      const t = Number(val)
      if (!Number.isFinite(n) || !Number.isFinite(t)) return false

      if (op.op === "gt") return n > t
      if (op.op === "lt") return n < t
      return true
    })

    return { ...base, rows, meta: { ...base.meta, rows: rows.length, createdAt: Date.now() } }
  }

  if (op.kind === "cast") {
    if (!base.columns.includes(op.column)) return base
    const res = castColumnStrict(base.rows as any, op.column, op.to)
    return { ...base, rows: res.rows, meta: { ...base.meta, createdAt: Date.now() } }
  }

  if (op.kind === "dedupe") {
    const keys = op.keyColumns.length ? op.keyColumns : base.columns
    const seen = new Set<string>()
    const out: Record<string, unknown>[] = []

    for (const r of base.rows as any[]) {
      const sig = keys.map((k) => String(r?.[k] ?? "")).join("||")
      if (seen.has(sig)) continue
      seen.add(sig)
      out.push(r)
    }

    return { ...base, rows: out, meta: { ...base.meta, rows: out.length, createdAt: Date.now() } }
  }

  if (op.kind === "autoclean") {
    return { ...base, meta: { ...base.meta, createdAt: Date.now() } }
  }

  return base
}

export function applyTransformPipeline(base: Dataset, ops: TransformOp[]): Dataset {
  return ops.reduce((acc, op) => applyTransform(acc, op), base)
}
