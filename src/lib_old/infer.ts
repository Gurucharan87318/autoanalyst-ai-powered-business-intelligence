import type { ColumnProfile, ColumnType, Dataset } from './DatasetTypes'

type Mode = 'sample' | 'full'

const isNullish = (v: unknown) =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

const toNumberMaybe = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v !== 'string') return null
  const cleaned = v.replace(/[₹,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

const looksLikeBoolean = (v: unknown) => {
  if (typeof v === 'boolean') return true
  if (typeof v !== 'string') return false
  const t = v.trim().toLowerCase()
  return t === 'true' || t === 'false' || t === 'yes' || t === 'no' || t === 'y' || t === 'n' || t === '0' || t === '1'
}

const looksLikeDate = (v: unknown) => {
  if (typeof v !== 'string') return false
  const t = Date.parse(v)
  return !Number.isNaN(t)
}

function detectType(values: unknown[]): ColumnType {
  const sample = values.slice(0, 120)
  if (sample.length === 0) return 'unknown'

  const numberHits = sample.map(toNumberMaybe).filter((n): n is number => n !== null).length
  if (numberHits / sample.length >= 0.9) return 'number'

  const boolHits = sample.filter(looksLikeBoolean).length
  if (boolHits / sample.length >= 0.95) return 'boolean'

  const dateHits = sample.filter(looksLikeDate).length
  if (dateHits / sample.length >= 0.9) return 'date'

  return 'string'
}

export function profileDataset(
  dataset: Dataset,
  opts: { mode: Mode; sampleSize?: number } = { mode: 'sample', sampleSize: 5000 }
): ColumnProfile[] {
  const data = dataset.rows ?? []
  if (!data.length) return []

  const { mode, sampleSize = 5000 } = opts
  const scan = mode === 'full' ? data : data.slice(0, Math.min(sampleSize, data.length))

  const columns = dataset.columns?.length ? dataset.columns : Object.keys(scan[0] ?? {})

  return columns.map((col) => {
    const raw = scan.map((row: any) => row?.[col])
    const nonNull = raw.filter(v => !isNullish(v))

    const inferredType = detectType(nonNull)

    const nullCount = scan.length - nonNull.length
    const nullPct = scan.length ? (nullCount / scan.length) * 100 : 0

    const uniqueCount = new Set(nonNull.map(v => String(v))).size
    const cardinality = nonNull.length ? uniqueCount / nonNull.length : 0

    const sampleValues = nonNull.slice(0, 6).map(v => String(v))

    let min: number | undefined
    let max: number | undefined
    let mean: number | undefined

    if (inferredType === 'number') {
      const nums = nonNull.map(toNumberMaybe).filter((n): n is number => n !== null)
      if (nums.length) {
        let mn = nums[0]
        let mx = nums[0]
        let sum = 0
        for (const n of nums) {
          if (n < mn) mn = n
          if (n > mx) mx = n
          sum += n
        }
        min = mn
        max = mx
        mean = sum / nums.length
      }
    }

    return { name: col, inferredType, nullCount, nullPct, uniqueCount, cardinality, sampleValues, min, max, mean }
  })
}
