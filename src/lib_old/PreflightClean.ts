import type { ImportProfile } from "./Canonical";

function norm(s: any) {
  return String(s ?? "").replace(/\u00A0/g, " ").trim();
}

function isBlankRow(row: any) {
  return Object.values(row || {}).every((v) => norm(v) === "");
}

function isSeparatorRow(row: any) {
  const vals = Object.values(row || {}).map(norm).filter(Boolean);
  if (!vals.length) return true;
  const joined = vals.join(" ").toLowerCase();
  if (/^[-_=\s]+$/.test(joined)) return true;
  if (/(page\s*\d+|continued|report\s*generated)/i.test(joined)) return true;
  return false;
}

function parseIndianNumber(s0: any): number | null {
  const s = norm(s0);
  if (!s) return null;
  const cleaned = s
    .replace(/[₹]/g, "")
    .replace(/\b(inr|rs\.?|rupees)\b/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDateStrict(s0: any, style: "DMY" | "MDY"): string | null {
  const s = norm(s0);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  let a = Number(m[1]), b = Number(m[2]), y = Number(m[3]);
  if (y < 100) y += 2000;
  const day = style === "DMY" ? a : b;
  const mon = style === "DMY" ? b : a;
  if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
  const iso = `${String(y).padStart(4, "0")}-${String(mon).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return iso;
}

export function canonicalizeRows(rows: any[], profile: ImportProfile) {
  const fixes: string[] = [];
  const style = profile.dateStyle;

  const out: any[] = [];
  let dropped = 0;

  for (const r of rows || []) {
    if (!r || isBlankRow(r) || isSeparatorRow(r)) {
      dropped++;
      continue;
    }

    const row: any = { ...r };

    // Normalize mapped numeric fields
    for (const k of ["amount", "tax", "outstanding", "rate", "qty"] as const) {
      const col = (profile.mapping as any)?.[k];
      if (col && row[col] !== undefined) {
        const n = parseIndianNumber(row[col]);
        if (n !== null) row[col] = n;
      }
    }

    // Normalize mapped dates
    for (const k of ["date", "duedate"] as const) {
      const col = (profile.mapping as any)?.[k];
      if (col && row[col] !== undefined) {
        const iso = parseDateStrict(row[col], style);
        if (iso) row[col] = iso;
      }
    }

    out.push(row);
  }

  if (dropped) fixes.push(`Dropped ${dropped} blank/separator rows`);
  return { canonicalRows: out, fixes };
}
