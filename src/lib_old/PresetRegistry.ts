// src/lib/PresetRegistry.ts
import type { CanonicalField, ImportPresetId } from "./Canonical";

export type Preset = {
  id: ImportPresetId;
  name: string;
  synonyms: Partial<Record<CanonicalField, string[]>>;
  focus: CanonicalField[];
};

export const PRESETS: Preset[] = [
  {
    id: "generic",
    name: "Generic Sheet",
    synonyms: {
      date: ["date", "day", "txn date", "voucher date"],
      amount: ["amount", "total", "grand total", "net", "sales", "value"],
      customer: ["customer", "party", "client", "name"],
      item: ["item", "product", "particulars", "description"],
    },
    focus: ["date", "amount", "customer", "item"],
  },
  {
    id: "tally_sales",
    name: "Tally Sales Register",
    synonyms: {
      date: ["date", "voucher date"],
      customer: ["party", "party name", "buyer", "ledger"],
      amount: ["amount", "total", "grand total", "net amount"],
      gstin: ["gstin"],
      tax: ["gst", "tax", "igst", "cgst", "sgst"],
      item: ["stock item", "item", "particulars"],
      qty: ["qty", "quantity"],
      rate: ["rate", "price"],
    },
    focus: ["date", "amount", "customer", "gstin", "tax", "item", "qty"],
  },
  {
    id: "tally_ledger",
    name: "Tally Ledger",
    synonyms: {
      date: ["date", "voucher date"],
      customer: ["party", "ledger", "particulars"],
      amount: ["amount", "debit", "credit"],
      gstin: ["gstin"],
      tax: ["gst", "tax"],
    },
    focus: ["date", "customer", "amount"],
  },
  {
    id: "bank",
    name: "Bank Statement",
    synonyms: {
      date: ["date", "value date", "txn date", "transaction date"],
      amount: ["amount", "debit", "credit"],
      customer: ["narration", "description", "remarks", "party"],
    },
    focus: ["date", "amount", "customer"],
  },
  {
    id: "zoho",
    name: "Zoho Books",
    synonyms: {
      date: ["date", "invoice date"],
      invoiceno: ["invoice", "invoice no", "invoice number"],
      customer: ["customer", "contact", "party"],
      amount: ["total", "grand total", "amount", "balance"],
      tax: ["tax", "gst"],
      gstin: ["gstin"],
      duedate: ["due date"],
      outstanding: ["outstanding", "balance due"],
    },
    focus: ["date", "invoiceno", "customer", "amount", "tax", "gstin"],
  },
  {
    id: "pos",
    name: "POS Export",
    synonyms: {
      date: ["date", "bill date", "time"],
      invoiceno: ["bill", "bill no", "receipt", "invoice"],
      item: ["item", "product", "sku", "barcode"],
      qty: ["qty", "quantity"],
      amount: ["amount", "total", "net", "sales"],
      customer: ["customer", "cashier"],
    },
    focus: ["date", "amount", "item", "qty"],
  },
];
