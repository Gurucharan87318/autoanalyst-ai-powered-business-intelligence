// lib/schemaHeuristics.ts
export type ColumnType = "string" | "number" | "date" | "currency" | "boolean";
export type ColumnRole = "metric" | "dimension" | "time" | "id";

export interface ColumnDef {
  name: string;
  type: ColumnType;
  role: ColumnRole | null;
  confidence: number;
  nullPct: number;
  uniqueCount: number;
  outlierPct: number;
}

export interface DatasetProfile {
  columns: ColumnDef[];
  intelligenceScore: number;
  alerts: string[];
}

const CURRENCY_RE = /[₹$£€]|INR|USD/i;
const DATE_DMY_RE = /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/;
const DATE_YMD_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/;
const BOOLEAN_RE = /^(true|false|1|0|yes|no)$/i;

function isCurrencyLike(s: string): boolean {
  if (!s) return false;
  if (CURRENCY_RE.test(s)) return true;
  const stripped = s.replace(/[₹$£€,]/g, "");
  return /^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(stripped);
}

function isDateLike(s: string): boolean {
  if (!s) return false;
  return DATE_DMY_RE.test(s) || DATE_YMD_RE.test(s);
}

function isBooleanLike(s: string): boolean {
  if (!s) return false;
  return BOOLEAN_RE.test(s);
}

function isNumericLike(s: string): boolean {
  if (!s) return false;
  return /^-?\d+(?:\.\d+)?$/.test(s.replace(/[₹$£€,]/g, ""));
}

function inferRole(name: string, type: ColumnType): ColumnRole | null {
  const n = name.toLowerCase();
  if (type === "date") {
    if (/(date|time|month|year|day)/.test(n)) return "time";
  }
  if (type === "number" || type === "currency") {
    if (/(revenue|sales|amount|amt|total|price|value|turnover|orders)/.test(n)) return "metric";
  }
  if (type === "string") {
    if (/(category|region|product|customer|name|segment|city|state)/.test(n)) return "dimension";
    if (/(id|code|no|number)/.test(n)) return "id";
  }
  return null;
}

function calcIntelligenceScore(columns: ColumnDef[]): number {
  let score = 100;
  score -= columns.filter((c) => c.nullPct > 10).length * 8;
  score -= columns.filter((c) => c.confidence < 0.7).length * 5;
  score -= columns.filter((c) => c.outlierPct > 5).length * 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function generateAlerts(columns: ColumnDef[]): string[] {
  const alerts: string[] = [];

  for (const c of columns) {
    if (c.nullPct > 10) alerts.push(`"${c.name}" has ${Math.round(c.nullPct)}% nulls.`);
    if (c.uniqueCount < 5 && c.type === "string")
      alerts.push(`"${c.name}" has low variety (${c.uniqueCount} unique values).`);
    if (c.outlierPct > 5) alerts.push(`"${c.name}" has ${Math.round(c.outlierPct)}% numeric outliers.`);
  }

  return alerts.slice(0, 8);
}

export function analyzeSchema(
  headers: string[],
  sampleRows: Record<string, string>[]
): DatasetProfile {
  const columns: ColumnDef[] = headers.map((name) => {
    const values = sampleRows.map((r) => r[name] ?? "");
    const nonNull = values.filter((v) => v !== "");
    const nullPct = values.length ? ((values.length - nonNull.length) / values.length) * 100 : 0;
    const uniques = new Set(nonNull.map((v) => v.trim()));
    const uniqueCount = uniques.size;

    let type: ColumnType = "string";
    let confidence = 0.5;
    let outlierPct = 0;

    if (nonNull.length > 0) {
      const numCount = nonNull.filter(isNumericLike).length;
      const currencyCount = nonNull.filter(isCurrencyLike).length;
      const dateCount = nonNull.filter(isDateLike).length;
      const boolCount = nonNull.filter(isBooleanLike).length;

      const total = nonNull.length;
      if (currencyCount / total > 0.7) {
        type = "currency";
        confidence = currencyCount / total;
      } else if (dateCount / total > 0.7) {
        type = "date";
        confidence = dateCount / total;
      } else if (boolCount / total > 0.8) {
        type = "boolean";
        confidence = boolCount / total;
      } else if (numCount / total > 0.7) {
        type = "number";
        confidence = numCount / total;
        // simple outlier heuristic on numeric
        const nums = nonNull.filter(isNumericLike).map((s) => Number(s.replace(/[₹$£€,]/g, "")));
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
        const outliers = nums.filter((n) => Math.abs(n - mean) > 3 * sd);
        outlierPct = nums.length ? (outliers.length / nums.length) * 100 : 0;
      } else {
        type = "string";
        confidence = 0.6;
      }
    }

    const role = inferRole(name, type);

    return {
      name,
      type,
      role,
      confidence,
      nullPct,
      uniqueCount,
      outlierPct,
    };
  });

  const intelligenceScore = calcIntelligenceScore(columns);
  const alerts = generateAlerts(columns);

  return { columns, intelligenceScore, alerts };
}
