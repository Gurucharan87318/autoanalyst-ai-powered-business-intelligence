// src/lib/Canonical.ts

export type DateStyle = "DMY" | "MDY";

// Canonical fields your app knows how to map
export type CanonicalField =
  | "date"
  | "invoiceno"
  | "customer"
  | "phone"
  | "item"
  | "qty"
  | "rate"
  | "amount"
  | "tax"
  | "gstin"
  | "paymentstatus"
  | "duedate"
  | "outstanding";

// Preset IDs (typed)
export type ImportPresetId =
  | "generic"
  | "tally_sales"
  | "tally_ledger"
  | "bank"
  | "zoho"
  | "pos";

// Mapping is from canonical field -> source column name
export type ColumnMapping = Partial<Record<CanonicalField, string>>;

export type ImportProfile = {
  presetId: ImportPresetId;
  mapping: ColumnMapping;
  dateStyle: DateStyle;
};
