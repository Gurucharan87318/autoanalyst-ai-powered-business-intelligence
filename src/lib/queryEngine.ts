import type { ColumnDef } from "../lib/schemaHeuristics";
import { getDbConnection } from "./db";

export type KPIResult = {
  rowCount: number;
  totalRevenue: number | null;
};

export type TrendPoint = { date: string; value: number };
export type CategoryPoint = { category: string; value: number };

type SemanticMapping = "revenue" | "time" | "category";

function quoteIdent(ident: string): string {
  return `"${ident.replaceAll(`"`, `""`)}"`;
}

function getMappedTo(column: ColumnDef): string | undefined {
  return (column as ColumnDef & { mappedTo?: string }).mappedTo;
}

function pickPrimary(
  schema: ColumnDef[],
  type: ColumnDef["type"],
  mappedTo?: SemanticMapping
): ColumnDef | undefined {
  if (mappedTo) {
    const preferred = schema.find(
      (c) => c.type === type && getMappedTo(c) === mappedTo
    );
    if (preferred) return preferred;
  }
  return schema.find((c) => c.type === type);
}

function toNumberSafe(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return 0;
}

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "bigint") return Number(v);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) {
    return Number(v);
  }
  return null;
}

export async function getKPIs(schema: ColumnDef[]): Promise<KPIResult> {
  const conn = await getDbConnection();

  const currencyCol = pickPrimary(schema, "currency", "revenue");
  const currencyExpr = currencyCol ? `SUM(${quoteIdent(currencyCol.name)})` : "NULL";

  const sql = `
    SELECT
      COUNT(*) AS row_count,
      ${currencyExpr} AS total_revenue
    FROM user_data
  `;

  const arrowTable = await conn.query(sql);
  const rows = arrowTable.toArray().map((r) => r.toJSON()) as Array<Record<string, unknown>>;
  const row = rows[0] ?? {};

  return {
    rowCount: toNumberSafe(row.row_count),
    totalRevenue: toNullableNumber(row.total_revenue),
  };
}

export async function getTrendData(schema: ColumnDef[]): Promise<TrendPoint[]> {
  const conn = await getDbConnection();

  const dateCol = pickPrimary(schema, "date", "time");
  const currencyCol = pickPrimary(schema, "currency", "revenue");
  if (!dateCol || !currencyCol) return [];

  const sql = `
    SELECT
      strftime('%Y-%m', CAST(${quoteIdent(dateCol.name)} AS DATE)) AS date,
      SUM(${quoteIdent(currencyCol.name)}) AS value
    FROM user_data
    WHERE ${quoteIdent(dateCol.name)} IS NOT NULL
      AND ${quoteIdent(currencyCol.name)} IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `;

  const arrowTable = await conn.query(sql);
  const rows = arrowTable.toArray().map((r) => r.toJSON()) as Array<Record<string, unknown>>;

  return rows
    .map((r) => ({
      date: String(r.date ?? ""),
      value: toNumberSafe(r.value),
    }))
    .filter((p) => p.date.length > 0);
}

export async function getCategoryData(schema: ColumnDef[]): Promise<CategoryPoint[]> {
  const conn = await getDbConnection();

  const categoryCol =
    pickPrimary(schema, "string", "category") ??
    schema.find((c) => c.type === "string");
  const currencyCol = pickPrimary(schema, "currency", "revenue");
  if (!categoryCol || !currencyCol) return [];

  const sql = `
    SELECT
      CAST(${quoteIdent(categoryCol.name)} AS VARCHAR) AS category,
      SUM(${quoteIdent(currencyCol.name)}) AS value
    FROM user_data
    WHERE ${quoteIdent(categoryCol.name)} IS NOT NULL
      AND ${quoteIdent(currencyCol.name)} IS NOT NULL
    GROUP BY 1
    ORDER BY value DESC
    LIMIT 5
  `;

  const arrowTable = await conn.query(sql);
  const rows = arrowTable.toArray().map((r) => r.toJSON()) as Array<Record<string, unknown>>;

  return rows
    .map((r) => ({
      category: String(r.category ?? ""),
      value: toNumberSafe(r.value),
    }))
    .filter((p) => p.category.length > 0);
}
