export function formatINR(value: number, opts?: { maxFractionDigits?: number }) {
  const maxFractionDigits = opts?.maxFractionDigits ?? 2
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: maxFractionDigits,
  }).format(value)
}
