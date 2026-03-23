import type { ImportProfile } from "./Canonical";

function norm(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

const KEY = "autoanalyst:mapping:v1";

export function saveMapping(columns: string[], profile: ImportProfile) {
  try {
    const store = JSON.parse(localStorage.getItem(KEY) || "{}");
    store[norm(columns.join("|"))] = profile;
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {}
}

export function loadMapping(columns: string[]): ImportProfile | null {
  try {
    const store = JSON.parse(localStorage.getItem(KEY) || "{}");
    const v = store[norm(columns.join("|"))];
    return v?.presetId && v?.mapping ? (v as ImportProfile) : null;
  } catch {
    return null;
  }
}
