import { ReactNode } from "react";

export type DatasetSource = "csv" | "xlsx" | "text";

export type DatasetMeta = {
  name: string;
  source: DatasetSource;
  bytes?: number;
  rows: number;
  cols: number;
  createdAt: number;
};

export type Dataset = {
  meta: DatasetMeta;
  columns: string[];
  rows: Record<string, unknown>[];
};

export type ColumnType = "number" | "string" | "boolean" | "date" | "unknown";

export type ColumnProfile = {
  name: string;
  inferredType: ColumnType;
  assignedType?: ColumnType | string;
  guessedType?: ColumnType | string;
  sampleValue?: ReactNode;
  distinctCount?: number;
  nullCount: number;
  nullPct: number;
  uniqueCount: number;
  cardinality: number;
  sampleValues: string[];
  min?: number;
  max?: number;
  mean?: number;
};
