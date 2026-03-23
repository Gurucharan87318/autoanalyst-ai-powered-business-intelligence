import type { DateStyle } from "./Canonical";

function looksDMY(s: string) {
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return false;
  const d = Number(m[1]), mo = Number(m[2]);
  return d > 12 && mo >= 1 && mo <= 12;
}

function looksMDY(s: string) {
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return false;
  const mo = Number(m[1]), d = Number(m[2]);
  return d > 12 && mo >= 1 && mo <= 12;
}

export function inferDateStyle(samples: any[]): { style: DateStyle | null; ambiguous: boolean } {
  const ss = samples
    .map((x) => String(x ?? "").trim())
    .filter(Boolean)
    .slice(0, 60);

  let dmy = 0, mdy = 0;
  for (const s of ss) {
    if (looksDMY(s)) dmy++;
    if (looksMDY(s)) mdy++;
  }

  if (dmy === 0 && mdy === 0) return { style: null, ambiguous: false };
  if (dmy > 0 && mdy === 0) return { style: "DMY", ambiguous: false };
  if (mdy > 0 && dmy === 0) return { style: "MDY", ambiguous: false };

  return { style: null, ambiguous: true };
}
