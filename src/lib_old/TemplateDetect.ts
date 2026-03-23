// src/lib/TemplateDetect.ts

export type TemplateId =
  | "tallysales"
  | "tallyledger"
  | "zohobooks"
  | "posexport"
  | "bankstatement"
  | "genericsheet"

export function detectTemplate(columns: string[], sampleRows: any[]): TemplateId {
  const lower = (columns ?? []).map((c) => String(c ?? "").toLowerCase())
  const has = (re: RegExp) => lower.some((c) => re.test(c))

  if (has(/narration|utr|ifsc|cheque|debit|credit|balance|txn/i) && has(/date/i)) return "bankstatement"
  if (has(/sku|barcode|pos|terminal|cashier|bill no|receipt|qty|item/i)) return "posexport"
  if (has(/invoice/i) && (has(/customer|contact/i) || has(/gstin/i))) return "zohobooks"
  if (has(/voucher|ledger|particulars|debit|credit/i)) return "tallyledger"
  if (has(/sales|item|qty|rate|amount/i) && has(/date/i)) return "tallysales"

  const r0 = sampleRows?.[0] ?? {}
  const txt = Object.values(r0).map(String).join(" ").toLowerCase()
  if (txt.includes("tally")) return "tallyledger"

  return "genericsheet"
}
