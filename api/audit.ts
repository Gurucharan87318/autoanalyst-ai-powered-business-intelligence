// ─────────────────────────────────────────────────────────────────────────────
// api/audit.ts  v2.0 — OpenRouter-Only Dual-Audit Pipeline
//
// No direct Gemini key required. Single OPENROUTER_API_KEY.
// Provider waterfall (all free tier):
//   Slot A (structured): google/gemini-2.0-flash-exp:free
//                     → google/gemini-2.0-flash-001:free   (404 fallback)
//   Slot B (narrative): deepseek/deepseek-r1:free
//                     → qwen/qwq-32b:free                  (429/404 fallback)
//
// Both slots run in parallel via Promise.allSettled.
// If both slots fail → graceful heuristic fallback JSON returned.
// B4: sql-generate mode routed separately (SqlSandbox).
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditPayload = {
  columns:          string[];
  sampleRows:       Record<string, unknown>[];
  detectedPattern?: string;
  rowCount?:        number;
  datasetName?:     string;
};

type SqlGeneratePayload = {
  mode:              "sql-generate";
  systemPrompt:      string;
  userContext:       string;
  columns:           string[];
  sampleRows:        Record<string, unknown>[];
  detectedPattern?:  string;
};

type StructuredAudit = {
  detectedPattern:    string;
  recommendedCharts:  string[];
  patternConfidence:  number;
  primarySignals:     string[];
};

type NarrativeAudit = {
  reasoning:        string;
  executiveSummary: string;
  nextMoves:        string[];
  riskFlags:        string[];
};

export type CombinedAudit = {
  detectedPattern:    string;
  recommendedCharts:  string[];
  reasoning:          string;
  executiveSummary:   string;
  nextMoves:          string[];
  riskFlags:          string[];
  primarySignals:     string[];
  patternConfidence:  number;
  source:             "merged" | "gemini-only" | "openrouter-only" | "heuristic";
  providers:          string[];
  generatedAt:        number;
};

// ─── Key Validation ───────────────────────────────────────────────────────────

function getOpenRouterKey(): string {
  const key = process.env.OPENROUTER_API_KEY ?? "";
  if (!key || key === "your-openrouter-api-key" || key.length < 10) {
    throw new Error("OPENROUTER_API_KEY is missing or invalid in .env");
  }
  return key;
}

// ─── Shared OpenRouter Fetch ──────────────────────────────────────────────────
// Single reusable fetch — model is the only thing that changes between calls.

async function callOpenRouter(
  model:    string,
  messages: { role: "system" | "user"; content: string }[],
  opts: { maxTokens?: number; temperature?: number; json?: boolean } = {}
): Promise<string> {
  const apiKey     = getOpenRouterKey();
  const timeoutMs  = Number(process.env.AI_TIMEOUT_MS ?? 10_000);

  const res = await withTimeout(
    fetch("https://openrouter.ai/api/v1/chat/completions", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://autoanalyst.app",
        "X-Title":       "AutoAnalyst",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature:    opts.temperature ?? 0.2,
        max_tokens:     opts.maxTokens   ?? 1024,
        ...(opts.json && { response_format: { type: "json_object" } }),
      }),
    }),
    timeoutMs
  );

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${model} → HTTP ${res.status}. ${raw.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error(`OpenRouter ${model} returned empty content.`);
  return content;
}

// ─── Prompts ──────────────────────────────────────────────────────────────────

function buildStructuredPrompt(payload: AuditPayload): string {
  return `
You are a senior data architect. Analyse this dataset schema and routing signals.

Dataset: "${payload.datasetName ?? "unknown"}"
Row count: ${payload.rowCount ?? "unknown"}
Columns: ${JSON.stringify(payload.columns)}
Sample rows (first 10): ${JSON.stringify(payload.sampleRows?.slice(0, 10))}
Heuristic pre-detection: "${payload.detectedPattern ?? "none"}"

Return ONLY valid JSON — no markdown, no explanation, no backticks.

{
  "detectedPattern": "one of exactly: Complex Cashflow | High-Velocity Retail | Revenue Operations | Receivables Exposure | Subscription Burn | Operational Trend Mix | Category-Heavy Analysis | General Enterprise",
  "recommendedCharts": ["array of 6-8 chart IDs from the valid list below"],
  "patternConfidence": 0.0 to 1.0,
  "primarySignals": ["list of 3-5 column-level signals you detected"]
}

Valid chart IDs (pick the most relevant 6-8):
trend-primary, trend-cumulative, category-top, category-secondary,
composition-share, liquidity-flow, running-balance, net-flow,
volume-distribution, velocity-pattern, concentration-view,
weekday-pattern, hourly-pattern, payment-mix, item-frequency,
invoice-aging, ledger-distribution

Rules:
- If Debit + Credit + Narration columns exist → detectedPattern MUST be "Complex Cashflow"
- If Item + PaymentMode + Amount exist → "High-Velocity Retail"
- If Invoice + Customer + Outstanding exist → "Receivables Exposure"
- If Date + high-variance Amount exist → prioritise trend-primary and trend-cumulative
- If low-cardinality text columns exist → always include composition-share
`.trim();
}

function buildNarrativePrompt(
  payload:         AuditPayload,
  structured:      StructuredAudit | null
): string {
  const pattern    = structured?.detectedPattern ?? payload.detectedPattern ?? "General Enterprise";
  const signals    = structured?.primarySignals?.join(", ") ?? "not available";
  const confidence = structured?.patternConfidence
    ? `${Math.round(structured.patternConfidence * 100)}%`
    : "unknown";

  return `
IMPORTANT: Respond in English only. Do not use any other language under any circumstances.

You are a world-class financial data analyst preparing a board-level audit report.

Dataset: "${payload.datasetName ?? "financial dataset"}"
Rows: ${payload.rowCount?.toLocaleString() ?? "unknown"}
Columns: ${payload.columns.join(", ")}
Detected business pattern: ${pattern}
Key signals found: ${signals}
Detection confidence: ${confidence}

Return ONLY valid JSON — no markdown, no backticks, no preamble.

{
  "reasoning": "3-4 sentences. Explain exactly why this visual strategy was chosen. Reference specific column names. Mention date density, value variance, cardinality. Sound like a senior consultant presenting to a CFO.",
  "executiveSummary": "2-3 sentences. Board-ready executive summary of this dataset's financial story. Start with the most important insight. Reference actual patterns detected.",
  "nextMoves": [
    "5-6 specific, actionable next steps. Each 1 sentence. Reference the actual data pattern. Be concrete — no generic advice."
  ],
  "riskFlags": [
    "2-3 specific data quality or business risks visible in this dataset structure."
  ]
}

Tone: authoritative, precise, board-ready. No filler words. Every sentence must add value.
`.trim();
}

// ─── Slot A: Structured Routing (OpenRouter Gemini free) ─────────────────────
// Tries gemini-2.0-flash-exp:free first, falls back to gemini-2.0-flash-001:free

async function callStructuredSlot(payload: AuditPayload): Promise<StructuredAudit> {
 const STRUCTURED_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",  // 262K ctx, tools, MoE — best for structured JSON
  "qwen/qwen3-next-80b-a3b-instruct:free",   // 262K ctx, tools — strong instruction following
  "meta-llama/llama-3.3-70b-instruct:free",
  "openrouter/free",  // 66K ctx, tools — reliable fallback
];

  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role:    "system",
      content: "You are a senior data architect. Respond with ONLY valid JSON. No markdown. No backticks. No explanation.",
    },
    {
      role:    "user",
      content: buildStructuredPrompt(payload),
    },
  ];

  let lastError: Error = new Error("No structured models tried");

  for (const model of STRUCTURED_MODELS) {
    try {
      const raw  = await callOpenRouter(model, messages, { maxTokens: 512, temperature: 0.05, json: true });
      const clean = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(clean) as StructuredAudit;
      console.info(`[Audit] Structured slot ✓ ${model}`);
      return parsed;
    } catch (err) {
      lastError = err as Error;
      console.warn(`[Audit] Structured slot ✗ ${model}:`, lastError.message);
    }
  }

  throw lastError;
}

// ─── Slot B: Narrative Audit (DeepSeek R1 → QwQ-32B fallback) ────────────────

async function callNarrativeSlot(
  payload:    AuditPayload,
  structured: StructuredAudit | null
): Promise<NarrativeAudit> {
 const NARRATIVE_MODELS = [
  "stepfun/step-3.5-flash:free",             // 256K ctx, reasoning MoE — top free model March 2026
  "nvidia/nemotron-3-super-120b-a12b:free",  // same model, second slot fallback
  "meta-llama/llama-3.3-70b-instruct:free", 
  "openrouter/free",  // proven stable fallback
];

  const messages: { role: "system" | "user"; content: string }[] = [
    {
      role:    "system",
      content: "You are a world-class financial data analyst. Respond in English only. Return valid JSON only — no markdown, no backticks, no preamble.",
    },
    {
      role:    "user",
      content: buildNarrativePrompt(payload, structured),
    },
  ];

  let lastError: Error = new Error("No narrative models tried");

  for (const model of NARRATIVE_MODELS) {
    try {
      const raw   = await callOpenRouter(model, messages, { maxTokens: 1024, temperature: 0.3, json: true });
      const clean = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(clean) as NarrativeAudit;
      console.info(`[Audit] Narrative slot ✓ ${model}`);
      return parsed;
    } catch (err) {
      lastError = err as Error;
      console.warn(`[Audit] Narrative slot ✗ ${model}:`, lastError.message);
    }
  }

  throw lastError;
}

// ─── SQL Generate Handler (B4) ────────────────────────────────────────────────

async function handleSqlGenerate(payload: SqlGeneratePayload): Promise<Response> {
 const SQL_MODELS = [
  "qwen/qwen3-next-80b-a3b-instruct:free",   // best instruction-following
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openrouter/free",
];

  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: payload.systemPrompt },
    { role: "user",   content: payload.userContext   },
  ];

  for (const model of SQL_MODELS) {
    try {
      const sql = await callOpenRouter(model, messages, { maxTokens: 512, temperature: 0.1 });
      if (sql) return Response.json({ sql });
    } catch (err) {
      console.warn(`[Audit] SQL generate ✗ ${model}:`, (err as Error).message);
    }
  }

  // All providers failed — return empty so SqlSandbox falls back to heuristic
  return Response.json({ sql: "" });
}

// ─── Merge ────────────────────────────────────────────────────────────────────

function mergeResults(
  structured:       StructuredAudit | null,
  narrative:        NarrativeAudit  | null,
  heuristicPattern: string | undefined
): CombinedAudit {
  const providers: string[] = [];
  if (structured) providers.push("openrouter-gemini");
  if (narrative)  providers.push("openrouter-deepseek");

  const source: CombinedAudit["source"] =
    providers.length === 2 ? "merged"
    : providers[0] === "openrouter-gemini"   ? "gemini-only"
    : providers[0] === "openrouter-deepseek" ? "openrouter-only"
    : "heuristic";

  return {
    detectedPattern:   structured?.detectedPattern ?? heuristicPattern ?? "General Enterprise",
    recommendedCharts: structured?.recommendedCharts ?? [],
    reasoning:
      narrative?.reasoning ??
      `${structured?.detectedPattern ?? "General Enterprise"} pattern detected. ` +
      `Primary signals: ${structured?.primarySignals?.join(", ") ?? "none"}.`,
    executiveSummary:
      narrative?.executiveSummary ??
      "Executive summary not available — running in offline mode.",
    nextMoves:         narrative?.nextMoves        ?? [],
    riskFlags:         narrative?.riskFlags        ?? [],
    primarySignals:    structured?.primarySignals  ?? [],
    patternConfidence: structured?.patternConfidence ?? 0.7,
    source,
    providers,
    generatedAt: Date.now(),
  };
}

// ─── Timeout Wrapper ──────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`AI provider timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as AuditPayload & { mode?: string };

    // B4: Route sql-generate mode before the audit pipeline
    if (body.mode === "sql-generate") {
      return handleSqlGenerate(body as SqlGeneratePayload);
    }

    const payload  = body as AuditPayload;
    const pipeline = process.env.AI_PIPELINE ?? "dual";

    // Run both slots in parallel — neither can crash the other
    const [structuredResult, narrativeResult] = await Promise.allSettled([
      pipeline !== "openrouter-only"
        ? callStructuredSlot(payload)
        : Promise.reject(new Error("structured slot disabled by AI_PIPELINE")),

      pipeline !== "gemini-only"
        ? callNarrativeSlot(payload, null)
        : Promise.reject(new Error("narrative slot disabled by AI_PIPELINE")),
    ]);

    const structured =
      structuredResult.status === "fulfilled" ? structuredResult.value : null;
    const narrative =
      narrativeResult.status === "fulfilled" ? narrativeResult.value : null;

    // If structured succeeded but narrative failed on the parallel run,
    // retry narrative once with the structured context — better prompt quality
    let finalNarrative = narrative;
    if (structured && !narrative && pipeline === "dual") {
      try {
        finalNarrative = await callNarrativeSlot(payload, structured);
      } catch {
        finalNarrative = null;
      }
    }

    if (structuredResult.status === "rejected")
      console.warn("[Audit] Structured slot failed:", (structuredResult.reason as Error).message);
    if (narrativeResult.status === "rejected")
      console.warn("[Audit] Narrative slot failed:", (narrativeResult.reason as Error).message);

    return Response.json(mergeResults(structured, finalNarrative, payload.detectedPattern));

  } catch (err) {
    console.error("[Audit] POST fatal:", err);
    return Response.json(
      { error: (err as Error).message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
