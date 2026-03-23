const keyFor = (name: string) => {
  const d = new Date()
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  return `aa_limit_${name}_${ym}`
}

export function getMonthlyUsage(name: string) {
  const k = keyFor(name)
  const raw = localStorage.getItem(k)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

export function incMonthlyUsage(name: string) {
  const k = keyFor(name)
  const next = getMonthlyUsage(name) + 1
  localStorage.setItem(k, String(next))
  return next
}

export function remainingMonthly(name: string, limit: number) {
  const used = getMonthlyUsage(name)
  return Math.max(0, limit - used)
}

export function canUseMonthly(name: string, limit: number) {
  return remainingMonthly(name, limit) > 0
}
