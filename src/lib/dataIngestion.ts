// lib/dataIngestion.ts
import type { ColumnDef } from "../lib/schemaHeuristics";
import { getDbConnection, getDbInstance } from "./db";

export type SanitizedRow = Record<string, string | number | null>;

const CURRENCY_STRIP_RE = /[₹$£,\s]/g;

export function parseCurrencyToNumber(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;

  const s = String(input).trim();
  if (!s) return null;

  // Handle parentheses negatives: (1,234.50)
  const isParenNegative = /^\(.*\)$/.test(s);
  const core = s.replace(/^\(|\)$/g, "").replace(CURRENCY_STRIP_RE, "");
  if (!core) return null;

  const n = Number(core);
  if (!Number.isFinite(n)) return null;
  return isParenNegative ? -n : n;
}

function sanitizeRows(rawData: unknown[], confirmedSchema: ColumnDef[]): SanitizedRow[] {
  const currencyCols = new Set(
    confirmedSchema.filter((c) => c.type === "currency").map((c) => c.name)
  );

  return rawData.map((rowUnknown) => {
    const row = (rowUnknown ?? {}) as Record<string, unknown>;
    const out: SanitizedRow = {};

    for (const col of confirmedSchema) {
      const v = row[col.name];

      if (currencyCols.has(col.name)) {
        out[col.name] = parseCurrencyToNumber(v);
        continue;
      }

      // Keep everything else as-is (mostly strings from PapaParse)
      if (v === undefined) out[col.name] = null;
      else if (v === null) out[col.name] = null;
      else if (typeof v === "number") out[col.name] = Number.isFinite(v) ? v : null;
      else out[col.name] = String(v);
    }

    return out;
  });
}

/**
 * Loads sanitized JSON rows into DuckDB as table `user_data`.
 * Uses: registerFileText + insertJSONFromPath as recommended for wasm ingestion. [web:37]
 */
export async function loadDataIntoDuckDB(
  rawData: unknown[],
  confirmedSchema: ColumnDef[]
): 

Promise<{ rowCount: number }> {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    throw new Error("No raw data provided for ingestion.");
  }
  if (!Array.isArray(confirmedSchema) || confirmedSchema.length === 0) {
    throw new Error("No confirmed schema provided for ingestion.");
  }

  const db = await getDbInstance();
  const conn = await getDbConnection();

  const sanitized = sanitizeRows(rawData, confirmedSchema);

  // Make table deterministic: drop & recreate
  await conn.query(`DROP TABLE IF EXISTS user_data;`);

  // Register the sanitized rows as a JSON file in DuckDB’s virtual FS, then insert. [web:37][web:40]
  const jsonPath = "user_data_rows.json";
  await db.registerFileText(jsonPath, JSON.stringify(sanitized)); // step 1: import into FS [web:37]
  await conn.insertJSONFromPath(jsonPath, { name: "user_data" }); // step 2: load into DuckDB table [web:37][web:42]

// inside loadDataIntoDuckDB(...) after insert
const countTable = await conn.query(`SELECT COUNT(*) AS row_count FROM user_data;`);
const countRows = countTable.toArray().map((r) => r.toJSON()) as Array<Record<string, unknown>>;
const rowCount = Number(countRows[0]?.row_count ?? 0);
return { rowCount };

}
