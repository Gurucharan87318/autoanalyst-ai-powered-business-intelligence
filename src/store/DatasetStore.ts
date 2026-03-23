import { create } from "zustand";

export type CellValue = string | number | boolean | null;

export type DatasetRow = Record<string, CellValue>;

export type Dataset = {
  columns: string[];
  rows: DatasetRow[];
  meta: {
    name: string;
    rows: number;
    cols: number;
    bytes: number;
    createdAt: number;
    source: "upload" | "clipboard" | "manual";
  };
};

export type SchemaKind = "string" | "number" | "date" | "boolean" | "currency";

export type SchemaColumn = {
  name: string;
  guessedType: SchemaKind;
  assignedType: SchemaKind;
  nullPct: number;
  distinctCount: number;
  sampleValue: string;
};

export type DatasetSchema = {
  columns: SchemaColumn[];
  detectedFormat: "Tally Export" | "Zoho Books" | "Bank Statement" | "Unknown";
  generatedAt: number;
};

type DatasetState = {
  dataset: Dataset | null;
  schema: DatasetSchema | null;
  detectedFormat: DatasetSchema["detectedFormat"] | null;
  setDataset: (dataset: Dataset | null) => void;
  setSchema: (schema: DatasetSchema | null) => void;
  setDetectedFormat: (format: DatasetSchema["detectedFormat"] | null) => void;
  reset: () => void;
};

export const useDatasetStore = create<DatasetState>((set) => ({
  dataset: null,
  schema: null,
  detectedFormat: null,

  setDataset: (dataset) =>
    set(() => ({
      dataset,
    })),

  setSchema: (schema) =>
    set(() => ({
      schema,
    })),

  setDetectedFormat: (detectedFormat) =>
    set(() => ({
      detectedFormat,
    })),

  reset: () =>
    set(() => ({
      dataset: null,
      schema: null,
      detectedFormat: null,
    })),
}));
