// src/lib/healthEngine.ts
export type Severity = "low" | "med" | "high"

export type DiagnosisCategory =
  | "Cashflow"
  | "Receivables"
  | "Revenue"
  | "Data quality"
  | "Risk"
  | "GST"

export type DiagnosisItem = {
  id: string
  category: DiagnosisCategory
  title: string
  severity: Severity
  evidence: string
  whatToDo: string
  antibiotic?: string
}

export type HealthLabs = {
  totalRows: number
  amountCol: string | null
  dateCol: string | null

  cashflowApprox: null | {
    inflow: number
    outflow: number
    net: number
    netPctOfInflow: number | null
    method: "debitCredit" | "signedAmount"
  }

  volatility: null | {
    medianAbs: number
    p95Abs: number
    spikeRate: number
  }

  outlierRate: number | null

  duplicates: null | {
    checkedRows: number
    duplicateRows: number
    duplicateRate: number
    key: string
  }

  receivables: null | {
    total: number
    unpaidCount: number
    unpaidRate: number
    overdueCount: number
    overdueRate: number
    buckets?: { label: string; count: number; amount: number }[]
    heuristic: string
  }

  gst: null | {
    gstinCol: string | null
    taxCol: string | null
    gstRateCol: string | null
    validRateCount: number
    invalidRateCount: number
    missingGstinCount: number
    invalidGstinCount: number
    rowsChecked: number
    slabSales?: Record<string, number>
    heuristic: string
  }
}

export function uid() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16)
}

export function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0
  return Math.max(0, Math.min(1, x))
}

export function pct(n: number, d: number) {
  if (!d) return 0
  return n / d
}

export function median(nums: number[]) {
  if (!nums.length) return null
  const a = [...nums].sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  return a.length % 2 === 0 ? (a[mid - 1] + a[mid]) / 2 : a[mid]
}

export function parseINRNumber(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  let s = String(v ?? "").trim()
  if (!s) return null

  // negative brackets: (1,234.00)
  let neg = false
  if (s.startsWith("(") && s.endsWith(")")) {
    neg = true
    s = s.slice(1, -1).trim()
  }

  // Dr/Cr suffixes (common exports)
  const lower = s.toLowerCase()
  if (/\bdr\b/.test(lower)) neg = true
  if (/\bcr\b/.test(lower)) neg = false

  // strip currency symbols/commas/spaces
  s = s.replace(/₹/g, "").replace(/,/g, "").replace(/\s+/g, " ").trim()

  // remove trailing words (dr/cr already handled)
  s = s.replace(/[a-zA-Z]+/g, "").trim()

  if (!s) return null
  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return neg ? -Math.abs(n) : n
}

export function parseDateMs(v: any): number | null {
  const s0 = String(v ?? "").trim()
  if (!s0) return null

  // native/ISO first
  const t0 = new Date(s0).getTime()
  if (Number.isFinite(t0)) return t0

  // DD/MM/YYYY or DD-MM-YYYY fallback (common India exports)
  const m = s0.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/)
  if (m) {
    const dd = Number(m[1])
    const mm = Number(m[2])
    const yy = Number(m[3].length === 2 ? `20${m[3]}` : m[3])
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12 && yy >= 1900) {
      const t = new Date(yy, mm - 1, dd).getTime()
      return Number.isFinite(t) ? t : null
    }
  }

  return null
}

// GSTIN: 15 chars: 2 digits + 10 PAN-like + 1 entity + Z + 1 checksum
export function isValidGSTIN(gstin: string) {
  const s = String(gstin ?? "").trim().toUpperCase()
  if (s.length !== 15) return false
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(s)
}

function findColByKeywords(columns: string[], keywords: string[]) {
  const lower = columns.map((c) => String(c ?? "").toLowerCase())
  for (const kw of keywords) {
    const i = lower.findIndex((c) => c.includes(kw))
    if (i !== -1) return columns[i]
  }
  return null
}

function safeString(x: any) {
  return String(x ?? "").trim()
}

function rowKeyFromCols(row: any, cols: string[]) {
  return cols.map((c) => safeString(row?.[c]).toLowerCase()).join("|")
}

function normalizeRateToNumber(rateRaw: string): number {
  const cleaned = String(rateRaw ?? "").trim().replace(/[^0-9.]/g, "")
  return cleaned ? Number(cleaned) : NaN
}

export function computeHealthOffline(args: {
  columns: string[]
  rows: any[]
  mapping: any // amountCol/dateCol/customerCol/itemCol/gstinCol/taxCol/debitCol/creditCol/balanceCol/qtyCol
}) {
  const { columns, rows, mapping } = args

  const amountCol: string | null = mapping?.amountCol ?? null
  const dateCol: string | null = mapping?.dateCol ?? null
  const debitCol: string | null = mapping?.debitCol ?? null
  const creditCol: string | null = mapping?.creditCol ?? null
  const customerCol: string | null = mapping?.customerCol ?? null
  const itemCol: string | null = mapping?.itemCol ?? null
  const gstinCol: string | null = mapping?.gstinCol ?? null
  const taxCol: string | null = mapping?.taxCol ?? null

  const gstRateCol =
    findColByKeywords(columns, [
      "gst%",
      "gst %",
      "gst rate",
      "tax%",
      "tax %",
      "tax rate",
      "igst",
      "cgst",
      "sgst",
      "rate (%)",
      "gst slab",
    ]) ?? null

  // ---------- freshness ----------
  let lastTs: number | null = null
  if (dateCol) {
    for (const r of rows) {
      const t = parseDateMs(r?.[dateCol])
      if (t != null) lastTs = lastTs == null ? t : Math.max(lastTs, t)
    }
  }

  const daysOld = lastTs == null ? null : Math.round((Date.now() - lastTs) / (1000 * 60 * 60 * 24))
  const freshnessScore =
    daysOld == null ? 0.45 : daysOld <= 7 ? 0.95 : daysOld <= 21 ? 0.8 : daysOld <= 45 ? 0.6 : 0.35

  // ---------- amount parsing quality ----------
  let parsed = 0
  let totalTried = 0
  const amounts: number[] = []

  if (amountCol) {
    for (const r of rows) {
      totalTried++
      const n = parseINRNumber(r?.[amountCol])
      if (n != null) {
        parsed++
        amounts.push(n)
      }
    }
  }

  const amountParse = totalTried ? parsed / totalTried : null
  const parseScore = amountParse == null ? 0.5 : clamp01(amountParse)

  // ---------- concentration (top customer share) ----------
  let top1Share: number | null = null
  if (customerCol && amountCol) {
    const byCustomer = new Map<string, number>()
    let total = 0
    for (const r of rows) {
      const c = safeString(r?.[customerCol]) || "unknown"
      const a = parseINRNumber(r?.[amountCol])
      if (a == null) continue
      total += Math.abs(a)
      byCustomer.set(c, (byCustomer.get(c) ?? 0) + Math.abs(a))
    }
    if (total > 0 && byCustomer.size) {
      const max = Math.max(...Array.from(byCustomer.values()))
      top1Share = max / total
    }
  }
  const concentrationScore = top1Share == null ? 0.6 : clamp01(1 - top1Share)

  const overallScore = clamp01((freshnessScore + parseScore + concentrationScore) / 3)

  // ---------- labs ----------
  const labs: HealthLabs = {
    totalRows: rows.length,
    amountCol,
    dateCol,
    cashflowApprox: null,
    volatility: null,
    outlierRate: null,
    duplicates: null,
    receivables: null,
    gst: null,
  }

  // volatility/outliers
  if (amounts.length >= 20) {
    const abs = amounts.map((x) => Math.abs(x)).filter((x) => Number.isFinite(x) && x > 0)
    abs.sort((a, b) => a - b)
    const med = median(abs) ?? 0
    const p95 = abs[Math.max(0, Math.floor(0.95 * (abs.length - 1)))] ?? med
    const spikeCount = abs.filter((x) => x > med * 1.6).length
    const outlierCount = abs.filter((x) => x > med * 10).length
    labs.volatility = { medianAbs: med, p95Abs: p95, spikeRate: pct(spikeCount, abs.length) }
    labs.outlierRate = pct(outlierCount, abs.length)
  }

  // cashflow approximation
  if (debitCol && creditCol) {
    let inflow = 0
    let outflow = 0
    for (const r of rows) {
      const cr = parseINRNumber(r?.[creditCol])
      const dr = parseINRNumber(r?.[debitCol])
      if (cr != null) inflow += Math.max(0, cr)
      if (dr != null) outflow += Math.max(0, dr)
    }
    const net = inflow - outflow
    labs.cashflowApprox = {
      inflow,
      outflow,
      net,
      netPctOfInflow: inflow > 0 ? net / inflow : null,
      method: "debitCredit",
    }
  } else if (amounts.length >= 10) {
    let inflow = 0
    let outflow = 0
    for (const a of amounts) {
      if (a >= 0) inflow += a
      else outflow += Math.abs(a)
    }
    const net = inflow - outflow
    labs.cashflowApprox = {
      inflow,
      outflow,
      net,
      netPctOfInflow: inflow > 0 ? net / inflow : null,
      method: "signedAmount",
    }
  }

  // duplicates (date+amount+customer/item if present)
  {
    const keyCols: string[] = []
    if (dateCol) keyCols.push(dateCol)
    if (amountCol) keyCols.push(amountCol)
    if (customerCol) keyCols.push(customerCol)
    else if (itemCol) keyCols.push(itemCol)

    if (keyCols.length >= 2 && rows.length >= 20) {
      const seen = new Map<string, number>()
      let dupRows = 0
      const checked = Math.min(rows.length, 5000)
      for (let i = 0; i < checked; i++) {
        const k = rowKeyFromCols(rows[i], keyCols)
        const c = (seen.get(k) ?? 0) + 1
        seen.set(k, c)
        if (c >= 2) dupRows++
      }
      labs.duplicates = {
        checkedRows: checked,
        duplicateRows: dupRows,
        duplicateRate: checked ? dupRows / checked : 0,
        key: keyCols.join("+"),
      }
    }
  }

  // receivables aging tiers (best-effort)
  {
    const lower = columns.map((c) => String(c ?? "").toLowerCase())
    const statusCol =
      columns[lower.findIndex((c) => c.includes("status"))] ??
      columns[lower.findIndex((c) => c.includes("payment status"))] ??
      null
    const dueCol =
      columns[lower.findIndex((c) => c.includes("due"))] ??
      columns[lower.findIndex((c) => c.includes("due date"))] ??
      null
    const balanceCol =
      columns[lower.findIndex((c) => c.includes("balance"))] ??
      columns[lower.findIndex((c) => c.includes("outstanding"))] ??
      columns[lower.findIndex((c) => c.includes("pending"))] ??
      null
    const invoiceDateCol =
      dateCol ??
      columns[lower.findIndex((c) => c.includes("invoice date"))] ??
      columns[lower.findIndex((c) => c.includes("bill date"))] ??
      null

    const now = Date.now()
    const checked = Math.min(rows.length, 8000)
    let total = 0
    let unpaid = 0
    let overdue = 0

    const buckets: { label: string; count: number; amount: number }[] = [
      { label: "0-30", count: 0, amount: 0 },
      { label: "31-60", count: 0, amount: 0 },
      { label: "61-90", count: 0, amount: 0 },
      { label: "90+", count: 0, amount: 0 },
    ]

    let usedTier = "Heuristic via status/due/balance best-effort."

    if (balanceCol || statusCol || dueCol) {
      for (let i = 0; i < checked; i++) {
        const r = rows[i]
        total++

        const bal = balanceCol ? parseINRNumber(r?.[balanceCol]) : null
        const status = statusCol ? safeString(r?.[statusCol]).toLowerCase() : ""
        const dueMs = dueCol ? parseDateMs(r?.[dueCol]) : null
        const invMs = invoiceDateCol ? parseDateMs(r?.[invoiceDateCol]) : null

        const looksUnpaid =
          (bal != null && bal > 0) ||
          status.includes("unpaid") ||
          status.includes("pending") ||
          status.includes("overdue") ||
          status.includes("partially")

        if (looksUnpaid) unpaid++

        const isOverdue = looksUnpaid && dueMs != null && dueMs < now
        if (isOverdue) overdue++

        // Buckets: either days overdue (due date) OR invoice age (invoice date)
        const baseMs = dueMs ?? invMs
        if (baseMs != null && looksUnpaid) {
          const ageDays = Math.max(0, Math.round((now - baseMs) / (1000 * 60 * 60 * 24)))
          const amt = bal != null ? bal : 0
          if (ageDays <= 30) {
            buckets[0].count++
            buckets[0].amount += amt
          } else if (ageDays <= 60) {
            buckets[1].count++
            buckets[1].amount += amt
          } else if (ageDays <= 90) {
            buckets[2].count++
            buckets[2].amount += amt
          } else {
            buckets[3].count++
            buckets[3].amount += amt
          }
          usedTier = dueMs != null ? "Buckets = days overdue (due date)." : "Buckets = invoice age (approx)."
        }
      }

      labs.receivables = {
        total,
        unpaidCount: unpaid,
        unpaidRate: pct(unpaid, Math.max(1, total)),
        overdueCount: overdue,
        overdueRate: pct(overdue, Math.max(1, total)),
        buckets: buckets.some((b) => b.count > 0) ? buckets : undefined,
        heuristic: usedTier,
      }
    }
  }

  // GST checks
  {
    const checked = Math.min(rows.length, 8000)
    let invalidGstin = 0
    let missingGstin = 0
    let validRate = 0
    let invalidRate = 0
    const slabSales: Record<string, number> = { "0%": 0, "5%": 0, "12%": 0, "18%": 0, "28%": 0, other: 0 }

    for (let i = 0; i < checked; i++) {
      const r = rows[i]
      const gstin = gstinCol ? safeString(r?.[gstinCol]) : ""
      if (gstinCol) {
        if (!gstin) missingGstin++
        else if (!isValidGSTIN(gstin)) invalidGstin++
      }

      const amt = amountCol ? parseINRNumber(r?.[amountCol]) : null
      const rateRaw = gstRateCol ? safeString(r?.[gstRateCol]) : ""
      const rate = normalizeRateToNumber(rateRaw)

      if (gstRateCol) {
        if (Number.isFinite(rate) && rate >= 0) {
          validRate++
          const key =
            rate === 0 ? "0%" : rate === 5 ? "5%" : rate === 12 ? "12%" : rate === 18 ? "18%" : rate === 28 ? "28%" : "other"
          if (amt != null) slabSales[key] = (slabSales[key] ?? 0) + Math.abs(amt)
        } else if (rateRaw) {
          invalidRate++
        }
      }
    }

    if (gstinCol || gstRateCol || taxCol) {
      labs.gst = {
        gstinCol,
        taxCol,
        gstRateCol,
        validRateCount: validRate,
        invalidRateCount: invalidRate,
        missingGstinCount: missingGstin,
        invalidGstinCount: invalidGstin,
        rowsChecked: checked,
        slabSales: gstRateCol ? slabSales : undefined,
        heuristic: gstRateCol ? "Slab based on GST%/Tax% column." : "GSTIN format check only (no rate column found).",
      }
    }
  }

  // ---------- diagnosis ----------
  const dx: DiagnosisItem[] = []

  if (!amountCol) {
    dx.push({
      id: uid(),
      category: "Data quality",
      title: "Amount column missing",
      severity: "high",
      evidence: "Health engine cannot compute revenue/cashflow without an amount field.",
      whatToDo: "Go to Transform and map/cast the sales/amount column as numeric, then re-run Health.",
    })
  }

  if (!dateCol) {
    dx.push({
      id: uid(),
      category: "Data quality",
      title: "Date column missing",
      severity: "med",
      evidence: "Trends, freshness scoring, and aging checks are limited without a date field.",
      whatToDo: "Rename/map your date column (Invoice Date / Txn Date) and re-run Health.",
    })
  }

  if (amountParse != null && amountParse < 0.9) {
    dx.push({
      id: uid(),
      category: "Data quality",
      title: "Amount parsing quality is low",
      severity: amountParse < 0.7 ? "high" : "med",
      evidence: `Only ${(amountParse * 100).toFixed(0)}% of rows parsed as numeric.`,
      whatToDo: "Remove currency symbols/commas, handle Dr/Cr/brackets, cast column to number in Transform, then re-run.",
    })
  }

  if (daysOld != null && daysOld > 45) {
    dx.push({
      id: uid(),
      category: "Data quality",
      title: "Data is stale",
      severity: "med",
      evidence: `Latest transaction is ${daysOld} days old.`,
      whatToDo: "Set a weekly export cadence and refresh the dataset before taking decisions.",
    })
  }

  if (labs.cashflowApprox?.netPctOfInflow != null && labs.cashflowApprox.netPctOfInflow < -0.15) {
    dx.push({
      id: uid(),
      category: "Cashflow",
      title: "Net cashflow looks negative",
      severity: "high",
      evidence: `Cashflow approx method=${labs.cashflowApprox.method}, net%=${(labs.cashflowApprox.netPctOfInflow * 100).toFixed(0)}%.`,
      whatToDo: "Freeze non-critical spend, follow up receivables, renegotiate vendor terms, and verify large outflows.",
    })
  }

  if ((labs.outlierRate ?? 0) > 0.02) {
    dx.push({
      id: uid(),
      category: "Risk",
      title: "Outlier pressure is high",
      severity: "med",
      evidence: `Outlier rate ~${Math.round((labs.outlierRate ?? 0) * 100)}% (very large transactions vs median).`,
      whatToDo: "Validate large invoices (duplicates/rounding), add approval threshold for high amounts.",
    })
  }

  if (labs.duplicates && labs.duplicates.duplicateRate > 0.01) {
    dx.push({
      id: uid(),
      category: "Data quality",
      title: "Possible duplicate entries detected",
      severity: labs.duplicates.duplicateRate > 0.03 ? "high" : "med",
      evidence: `Duplicate rate ${(labs.duplicates.duplicateRate * 100).toFixed(1)}% using key ${labs.duplicates.key}.`,
      whatToDo: "Check import process; dedupe by invoice/txn id; filter duplicate rows before reporting.",
    })
  }

  if (top1Share != null && top1Share > 0.35) {
    dx.push({
      id: uid(),
      category: "Risk",
      title: "Customer concentration risk (Top 1)",
      severity: "med",
      evidence: `Top customer share ${(top1Share * 100).toFixed(1)}% of total.`,
      whatToDo: "Diversify: add 2–3 new accounts, cap credit exposure to the top buyer.",
    })
  }

  if (labs.receivables) {
    if (labs.receivables.overdueRate > 0.12) {
      dx.push({
        id: uid(),
        category: "Receivables",
        title: "Overdue receivables risk (Udhar)",
        severity: "high",
        evidence: `Overdue rate ${Math.round(labs.receivables.overdueRate * 100)}% (${labs.receivables.heuristic}).`,
        whatToDo: "Start a dunning cadence, set credit limits, and prioritize top overdue parties for calls.",
      })
    } else if (labs.receivables.unpaidRate > 0.25) {
      dx.push({
        id: uid(),
        category: "Receivables",
        title: "Many invoices appear unpaid",
        severity: "med",
        evidence: `Unpaid rate ${Math.round(labs.receivables.unpaidRate * 100)}% (${labs.receivables.heuristic}).`,
        whatToDo: "Segment unpaid by age, call top 10 debtors, tighten payment terms for repeat delays.",
      })
    }
  }

  if (labs.gst) {
    const miss = labs.gst.missingGstinCount
    const inv = labs.gst.invalidGstinCount
    const n = Math.max(1, labs.gst.rowsChecked)
    const missRate = miss / n
    const invRate = inv / n

    if (labs.gst.gstinCol && (missRate > 0.1 || invRate > 0.02)) {
      dx.push({
        id: uid(),
        category: "GST",
        title: "GSTIN quality is weak",
        severity: missRate > 0.25 || invRate > 0.05 ? "high" : "med",
        evidence: `GSTIN missing ${Math.round(missRate * 100)}%, invalid ${Math.round(invRate * 100)}% (best-effort format validation).`,
        whatToDo: "Fix GSTIN capture at billing; validate GSTIN before invoicing; follow up customers missing GSTIN for B2B.",
      })
    }

    if (labs.gst.gstRateCol && labs.gst.invalidRateCount > 0) {
      dx.push({
        id: uid(),
        category: "GST",
        title: "GST rate column has invalid values",
        severity: "med",
        evidence: `Invalid GST/Tax rate values: ${labs.gst.invalidRateCount} rows (column=${labs.gst.gstRateCol}).`,
        whatToDo: "Clean rate column to numeric % (0/5/12/18/28). This improves GST slab summaries and filing prep.",
      })
    }
  }

  if (!dx.length) {
    dx.push({
      id: uid(),
      category: "Revenue",
      title: "No major issues detected offline",
      severity: "low",
      evidence: "Rules did not trigger high/med severity issues on this dataset.",
      whatToDo: "Review weekly; run Visual for deeper drivers; export an ops pack for stakeholders.",
    })
  }

  // deterministic “report” (AI optional later)
  const aiSummary = `Template health computed offline. Overall=${Math.round(overallScore * 100)}%.`
  const alerts = dx.slice(0, 10).map((d) => ({
    title: d.title,
    detail: d.evidence,
    severity: d.severity as Severity,
  }))
  const nextMoves = dx.slice(0, 10).map((d) => ({
    title: d.whatToDo.split(".")[0] || d.whatToDo,
    why: d.evidence,
  }))

  return {
    scores: {
      overallScore,
      freshnessScore,
      parseScore,
      concentrationScore,
      daysOld,
      amountParse,
      top1Share,
    },
    labs,
    diagnosis: dx,
    deterministic: {
      aiSummary,
      alerts,
      nextMoves,
    },
  }
}
