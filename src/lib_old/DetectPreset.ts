// src/lib/DetectPreset.ts
import type { ColumnMapping, ImportPresetId, CanonicalField } from "./Canonical";
import { PRESETS } from "./PresetRegistry";

function n(s: any) {
  return String(s ?? "").trim().toLowerCase();
}

function scorePreset(colsNorm: string[], presetId: ImportPresetId) {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return 0;

  let hits = 0;
  let total = 0;

  for (const field of preset.focus) {
    const keys = preset.synonyms?.[field] ?? [];
    if (!keys.length) continue;

    total += 1;
    const ok = keys.some((k) => colsNorm.some((c) => c.includes(n(k))));
    if (ok) hits += 1;
  }

  // Score in [0..1]
  return total ? hits / total : 0;
}

function pickBestColumn(columns: string[], keys: string[]) {
  const keysNorm = keys.map(n).filter(Boolean);
  if (!keysNorm.length) return undefined;

  // Strong match: includes keyword
  const hit = columns.find((c) => keysNorm.some((k) => n(c).includes(k)));
  return hit || undefined;
}

export function detectPreset(columns: string[]) {
  const colsNorm = columns.map(n);

  // 1) Score presets from PRESETS (focus fields only)
  const scored = PRESETS.map((p) => ({
    presetId: p.id,
    score: scorePreset(colsNorm, p.id),
  })).sort((a, b) => b.score - a.score);

  const best = scored[0] ?? { presetId: "generic" as ImportPresetId, score: 0 };

  // 2) Suggest mapping using synonyms for ALL fields present in preset.synonyms
  const preset = PRESETS.find((p) => p.id === best.presetId) ?? PRESETS[0];

  const suggestedMapping: ColumnMapping = {};
  const syn = preset.synonyms ?? {};

  (Object.keys(syn) as CanonicalField[]).forEach((field) => {
    const keys = syn[field] ?? [];
    const col = pickBestColumn(columns, keys);
    if (col) suggestedMapping[field] = col;
  });

  // 3) Confidence: based on preset score + presence of amount/date/customer
  const hasAmount = !!suggestedMapping.amount;
  const hasDate = !!suggestedMapping.date;
  const hasCustomer = !!suggestedMapping.customer;

  const base = 0.35 + best.score * 0.55; // best.score is 0..1
  const boost = (hasAmount ? 0.12 : 0) + (hasDate ? 0.08 : 0) + (hasCustomer ? 0.06 : 0);

  const confidence = Math.max(0.05, Math.min(0.98, base + boost));

  return { presetId: best.presetId, suggestedMapping, confidence };
}
