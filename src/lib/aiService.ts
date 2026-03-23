// lib/aiService.ts
export type ExecutiveSummary = {
  summary: string; // < 150 words requested (we'll instruct; model may still vary)
  key_drivers: string[]; // exactly 3 items requested
  recommended_action: string;
};

type FetchExecutiveSummaryArgs = {
  kpiData: unknown;
  categoryData: unknown;
  signal?: AbortSignal;
};

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const FALLBACK: ExecutiveSummary = {
  summary:
    "AI summary is temporarily unavailable. Your dashboard is generated from local, deterministic calculations, so KPIs and charts remain accurate.",
  key_drivers: [
    "Review the top categories contributing to revenue",
    "Check for missing or inconsistent values impacting totals",
    "Validate date coverage to ensure trend reliability",
  ],
  recommended_action:
    "Use the KPI and category panels to identify outliers, then refine schema mappings and rerun the dashboard.",
};

function coerceExecutiveSummary(json: unknown): ExecutiveSummary | null {
  if (!json || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;

  const summary = typeof obj.summary === "string" ? obj.summary : null;
  const recommended_action =
    typeof obj.recommended_action === "string" ? obj.recommended_action : null;

  const key_driversRaw = obj.key_drivers;
  const key_drivers =
    Array.isArray(key_driversRaw) && key_driversRaw.every((x) => typeof x === "string")
      ? (key_driversRaw as string[])
      : null;

  if (!summary || !recommended_action || !key_drivers) return null;

  // Enforce exactly 3 drivers for UI consistency (trim or pad defensively)
  const kd = key_drivers.slice(0, 3);
  while (kd.length < 3) kd.push("—");

  return { summary, key_drivers: kd, recommended_action };
}

function safeJsonParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export async function fetchExecutiveSummary(
  kpiData: unknown,
  categoryData: unknown
): Promise<ExecutiveSummary> {
  return fetchExecutiveSummaryWith({ kpiData, categoryData });
}

export async function fetchExecutiveSummaryWith(
  args: FetchExecutiveSummaryArgs
): Promise<ExecutiveSummary> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY as string | undefined;
  if (!apiKey) return FALLBACK;

  const controller = new AbortController();
  const timeoutMs = 12_000;

  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  // If caller provided a signal, abort when either aborts
  const signal = args.signal
    ? AbortSignal.any([args.signal, controller.signal])
    : controller.signal;

  try {
    const systemPrompt =
      'You are an expert business analyst. I will provide you with high-level metrics from a dataset. Return a JSON object with exactly three keys: "summary" (a paragraph under 150 words explaining the overall health), "key_drivers" (an array of 3 bullet points highlighting top categories or trends), and "recommended_action" (one strategic next step). Return only valid JSON.';

    const userPayload = {
      kpis: args.kpiData,
      top_categories: args.categoryData,
      constraints: {
        privacy: "Do not ask for or assume raw rows; you only have aggregated outputs.",
        output: "Return JSON only with exactly the three keys requested.",
      },
    };

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal,
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
        temperature: 0.2,
        // Force valid JSON output (older JSON mode). [web:108]
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      return FALLBACK;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) return FALLBACK;

    const parsed = safeJsonParse(content);
    const coerced = coerceExecutiveSummary(parsed);
    return coerced ?? FALLBACK;
  } catch {
    return FALLBACK;
  } finally {
    window.clearTimeout(timeout);
  }
}
