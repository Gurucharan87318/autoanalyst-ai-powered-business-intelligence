import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { Dataset } from "./DatasetTypes";

function safeString(v: any) {
  return v === null || v === undefined ? "" : String(v);
}

function normalizeCell(v: any) {
  const s = safeString(v).replace(/\u00A0/g, " ").trim();
  return s;
}

export async function parseCsvFile(file: File): Promise<Dataset> {
  const text = await file.text();
  const res = Papa.parse<Record<string, any>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  if (res.errors?.length) {
    const msg = res.errors[0]?.message || "CSV parse error";
    throw new Error(msg);
  }

  const rowsObj = (res.data || []).filter(Boolean);
  const columns =
    res.meta?.fields?.filter(Boolean) ??
    Array.from(new Set(rowsObj.flatMap((r) => Object.keys(r || {}))));

  const rows = rowsObj.map((r) => {
    const out: any = {};
    for (const c of columns) out[c] = normalizeCell((r as any)?.[c]);
    return out;
  });

  return {
    meta: { name: file.name, rows: rows.length, cols: columns.length, createdAt: Date.now() } as any,
    columns,
    rows,
  } as Dataset;
}

export async function parseXlsxFile(file: File): Promise<Dataset> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) throw new Error("No sheets found in Excel file");
  const ws = wb.Sheets[sheetName];

  // Read as 2D to handle messy headers (merged, multi-row)
  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as any;

  const nonEmptyRow = (row: any[]) => row.some((x) => normalizeCell(x) !== "");
  const cleanedGrid = grid.filter(nonEmptyRow).map((row) => row.map(normalizeCell));

  // Choose a header row: row with max non-empty unique strings
  let headerIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(12, cleanedGrid.length); i++) {
    const row = cleanedGrid[i] || [];
    const cells = row.map((x) => normalizeCell(x)).filter(Boolean);
    const uniq = new Set(cells.map((x) => x.toLowerCase()));
    const score = uniq.size;
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  }

  const headerRow = cleanedGrid[headerIdx] || [];
  const columns = headerRow.map((h, i) => (normalizeCell(h) ? normalizeCell(h) : `col_${i + 1}`));

  const body = cleanedGrid.slice(headerIdx + 1);
  const rows = body.map((r) => {
    const out: any = {};
    for (let i = 0; i < columns.length; i++) out[columns[i]] = normalizeCell(r?.[i]);
    return out;
  });

  return {
    meta: { name: file.name, rows: rows.length, cols: columns.length, createdAt: Date.now() } as any,
    columns,
    rows,
  } as Dataset;
}
