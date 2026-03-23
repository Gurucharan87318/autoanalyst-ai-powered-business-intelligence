// lib/fileParser.ts
import Papa from "papaparse";

export type AnalyzeFileResult = {
  fileName: string;
  headers: string[];
  sampleRows: Record<string, string>[];
  rowCountEstimate: number;
  fileSizeMB: number;
};

export class FileAnalyzeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileAnalyzeError";
  }
}

const MAX_PREVIEW_ROWS = 200;
const MAX_FILE_SIZE_MB = 50;

function isAllowed(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".csv") || n.endsWith(".tsv") || n.endsWith(".txt");
}

function normalizeHeader(name: string): string {
  return name
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export async function analyzeFile(file: File): Promise<AnalyzeFileResult> {
  if (!(file instanceof File)) throw new FileAnalyzeError("No file provided.");
  if (file.size === 0) throw new FileAnalyzeError("The file is empty.");
  if (!isAllowed(file)) {
    throw new FileAnalyzeError("Unsupported file type. Please upload CSV/TSV (.csv, .tsv, .txt).");
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    throw new FileAnalyzeError(`File too large. Max ${MAX_FILE_SIZE_MB}MB allowed.`);
  }

  return await new Promise<AnalyzeFileResult>((resolve, reject) => {
  Papa.parse<Record<string, string>>(file, {
  header: true,
  skipEmptyLines: true,
  worker: false, // ✅ fix
  preview: MAX_PREVIEW_ROWS,
  complete: (results) => {
    if (results.errors?.length) {
      reject(new FileAnalyzeError(results.errors[0]?.message ?? "Parse failed."));
      return;
    }

    const rawHeaders = results.meta.fields ?? [];
    const headers = rawHeaders.map(normalizeHeader).filter(Boolean);

    if (headers.length === 0) {
      reject(new FileAnalyzeError("No headers found. Ensure the first row has column names."));
      return;
    }

    const rows = (results.data ?? [])
      .filter((r) => r && typeof r === "object")
      .map((raw) => {
        const r = raw as Record<string, unknown>;
        const out: Record<string, string> = {};
        for (const h of headers) {
          const value = r[h];
          out[h] = typeof value === "string" ? value.trim() : String(value ?? "");
        }
        return out;
      })
      .slice(0, MAX_PREVIEW_ROWS);

    resolve({
      fileName: file.name,
      headers,
      sampleRows: rows,
      rowCountEstimate: Math.round(file.size / 200),
      fileSizeMB: Math.round((file.size / 1024 / 1024) * 10) / 10,
    });
  },
  error: (err) => reject(new FileAnalyzeError(err.message)),
});
  });
}
