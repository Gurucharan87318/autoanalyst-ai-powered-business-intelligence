import type { TemplateId } from "./TemplateDetect"

export type Mapping = {
  dateCol: string | null
  amountCol: string | null
  debitCol: string | null
  creditCol: string | null
  balanceCol: string | null
  customerCol: string | null
  itemCol: string | null
  qtyCol: string | null
  gstinCol: string | null
  taxCol: string | null
}

export type TemplateDef = {
  id: TemplateId
  title: string
  description: string
  // You can add “requiredMappings”, “kpiHints”, etc. later
}

export const TEMPLATES: Record<TemplateId, TemplateDef> = {
  bankstatement: {
    id: "bankstatement",
    title: "Bank Statement",
    description: "Cashflow, debit/credit trends, balance snapshot.",
  },
  posexport: {
    id: "posexport",
    title: "POS Export",
    description: "Item mix, store ops, spikes.",
  },
  zohobooks: {
    id: "zohobooks",
    title: "Zoho Books",
    description: "Invoices, customers, GST signals.",
  },
  tallyledger: {
    id: "tallyledger",
    title: "Tally Ledger",
    description: "Ledgers/vouchers view.",
  },
  tallysales: {
    id: "tallysales",
    title: "Tally Sales",
    description: "Sales register, GST trends.",
  },
  genericsheet: {
    id: "genericsheet",
    title: "Generic Sheet",
    description: "Best-effort KPIs + charts.",
  },
}
