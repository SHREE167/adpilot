import "server-only";
import type { CreativeFill } from "./copy-templates";
import { isMockMode, readFixture } from "./enrich/mock";
import type {
  ChannelAllocation,
  PlanInput,
  PlanResult,
  ProductIntel,
  SiteSnapshot,
} from "./types";

/** Whole-chain budgets (Groq attempt + Gemini fallback share it). */
const COPY_BUDGET_MS = 7000;
const RECOGNIZE_BUDGET_MS = 4500;
const KIT_BUDGET_MS = 8000;
/** Groq's share of the budget before Gemini gets the rest. */
const PRIMARY_SHARE = 0.6;
/** Do not start a fallback with less time than this. */
const MIN_FALLBACK_MS = 1200;

export interface LlmResult {
  used: boolean;
  provider: string | null;
  fill: CreativeFill | null;
  product: Partial<ProductIntel> | null;
}

export type LlmProviderId = "groq" | "google";

export interface LlmProvider {
  provider: LlmProviderId;
  key: string;
  url: string;
  model: string;
}

/** Groq first, Gemini as fallback. Keys from process.env only. No OpenAI. */
export function llmProviders(): LlmProvider[] {
  const out: LlmProvider[] = [];
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    out.push({
      provider: "groq",
      key: groq,
      url: "https://api.groq.com/openai/v1/chat/completions",
      // Llama models moved to Groq's Enterprise tier (404 on free keys, Oct 2026).
      model: process.env.GROQ_MODEL || "openai/gpt-oss-20b",
    });
  }
  const google = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (google) {
    // gemini-2.0-flash is shut down; 3.5 Flash-Lite is the fast, low-cost stable model.
    const model = process.env.GOOGLE_MODEL || "gemini-3.5-flash-lite";
    out.push({
      provider: "google",
      key: google,
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      model,
    });
  }
  return out;
}

/** One provider call. Exported for the fixture recorder. Throws on HTTP/empty errors. */
export async function callProvider(
  p: LlmProvider,
  prompt: string,
  signal: AbortSignal,
  maxTokens: number
): Promise<string> {
  return p.provider === "google"
    ? googleGenerate(p.url, p.key, prompt, signal, maxTokens)
    : openAiCompat(p.url, p.key, p.model, prompt, signal, maxTokens);
}

export interface Generated<T> {
  provider: LlmProviderId;
  model: string;
  content: string;
  value: T;
  /** Providers that failed before this one, with the reason. */
  failed: { provider: LlmProviderId; reason: string }[];
}

/**
 * Groq → Gemini. Each attempt is time-boxed inside one budget; a failure,
 * timeout or unparseable answer moves on to the next provider. Returns null
 * when no provider is configured or all fail. Never throws.
 */
export async function generate<T>(
  prompt: string,
  opts: { budgetMs: number; maxTokens: number; parse: (content: string) => T | null }
): Promise<Generated<T> | { failed: { provider: LlmProviderId; reason: string }[] } | null> {
  const list = llmProviders();
  if (!list.length) return null;
  const t0 = Date.now();
  const failed: { provider: LlmProviderId; reason: string }[] = [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const left = opts.budgetMs - (Date.now() - t0);
    const last = i === list.length - 1;
    const slice = last ? left : Math.max(MIN_FALLBACK_MS, Math.round(opts.budgetMs * PRIMARY_SHARE));
    if (left < MIN_FALLBACK_MS) {
      failed.push({ provider: p.provider, reason: "no time left" });
      break;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(slice, left));
    try {
      const content = await callProvider(p, prompt, controller.signal, opts.maxTokens);
      const value = opts.parse(content);
      if (value === null || value === undefined) throw new Error("unusable JSON");
      return { provider: p.provider, model: p.model, content, value, failed };
    } catch (err) {
      const reason = controller.signal.aborted ? "timeout" : err instanceof Error ? err.message.slice(0, 80) : "error";
      failed.push({ provider: p.provider, reason });
    } finally {
      clearTimeout(timer);
    }
  }
  return { failed };
}

function isGenerated<T>(r: Awaited<ReturnType<typeof generate<T>>>): r is Generated<T> {
  return Boolean(r && "value" in r);
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON object in LLM output");
  return JSON.parse(raw.slice(start, end + 1));
}

function asFill(data: unknown, mix: ChannelAllocation[]): CreativeFill | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const explanations: Record<string, string> = {};
  const expl = obj.explanations;
  if (expl && typeof expl === "object") {
    for (const row of mix) {
      const v = (expl as Record<string, unknown>)[row.channelId];
      if (typeof v === "string" && v.trim()) explanations[row.channelId] = v.trim();
    }
  }
  const adAngles = Array.isArray(obj.adAngles)
    ? obj.adAngles
        .map((a) => {
          if (!a || typeof a !== "object") return null;
          const x = a as Record<string, unknown>;
          if (typeof x.headline !== "string") return null;
          return {
            headline: String(x.headline),
            primaryText: String(x.primaryText || ""),
            cta: String(x.cta || "Learn more"),
            channelHint: String(x.channelHint || ""),
          };
        })
        .filter((x): x is CreativeFill["adAngles"][number] => Boolean(x))
    : [];
  const outreach = Array.isArray(obj.outreach)
    ? obj.outreach
        .map((a) => {
          if (!a || typeof a !== "object") return null;
          const x = a as Record<string, unknown>;
          if (typeof x.body !== "string") return null;
          return {
            channel: String(x.channel || "Channel"),
            title: String(x.title || "Script"),
            body: String(x.body),
          };
        })
        .filter((x): x is CreativeFill["outreach"][number] => Boolean(x))
    : [];
  if (adAngles.length < 3 && outreach.length < 8 && Object.keys(explanations).length === 0) {
    return null;
  }
  return { explanations, adAngles, outreach };
}

function asProduct(data: unknown): Partial<ProductIntel> | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const p = (obj.product && typeof obj.product === "object" ? obj.product : obj) as Record<string, unknown>;
  if (typeof p.summary !== "string" && typeof p.recognizedName !== "string") return null;
  const diffs = Array.isArray(p.differentiators)
    ? p.differentiators.filter((x): x is string => typeof x === "string")
    : undefined;
  const evidence = Array.isArray(p.evidence)
    ? p.evidence.filter((x): x is string => typeof x === "string")
    : undefined;
  const tier = p.priceTier;
  return {
    recognizedName: typeof p.recognizedName === "string" ? p.recognizedName : undefined,
    summary: typeof p.summary === "string" ? p.summary : undefined,
    category: typeof p.category === "string" ? p.category : undefined,
    priceTier:
      tier === "low" || tier === "mid" || tier === "high" || tier === "enterprise"
        ? tier
        : undefined,
    audience: typeof p.audience === "string" ? p.audience : undefined,
    tone: typeof p.tone === "string" ? p.tone : undefined,
    differentiators: diffs,
    evidence,
    source: "llm",
    confidence: typeof p.confidence === "number" ? p.confidence : 0.8,
  };
}

function buildPrompt(
  input: PlanInput,
  mix: ChannelAllocation[],
  intel: ProductIntel,
  site: SiteSnapshot
): string {
  const computed = {
    product: intel,
    site: {
      title: site.title,
      description: site.description,
      h1: site.h1,
      jsonLdName: site.jsonLdName,
      jsonLdType: site.jsonLdType,
      excerpt: site.textExcerpt?.slice(0, 400) || null,
      scraped: site.scraped,
    },
    city: input.city,
    goal: input.goal,
    audience_language: input.language,
    audience_age: input.audience_age,
    audience_notes: input.audience_notes,
    mix: mix.map((m) => ({
      channelId: m.channelId,
      name: m.name,
      score: m.score,
      budget: m.budget,
      percent: Math.round(m.percent * 10) / 10,
    })),
  };
  return `You are AdPilot. You already READ the product. Write as if you know it — never generic "try our product".
Do NOT change any numbers, scores, or budget splits.
Write everything in standard English: no Hinglish, no Hindi/Tamil/other Indian-language words or scripts. audience_language only describes the buyers; do not write in it.
Return ONLY JSON:
{
  "product": {
    "recognizedName": "",
    "summary": "2-3 sentences: what this thing is, who it is for, only facts from site/form",
    "category": "",
    "priceTier": "low|mid|high|enterprise",
    "audience": "",
    "tone": "",
    "differentiators": ["", ""],
    "evidence": ["quote a title/H1/meta if present"],
    "confidence": 0.0
  },
  "explanations": { "<channelId>": "why THIS product belongs on this channel in ${input.city}" },
  "adAngles": [ { "headline": "", "primaryText": "", "cta": "", "channelHint": "" } ],
  "outreach": [ { "channel": "", "title": "", "body": "" } ]
}
Rules:
- mention the actual product name and one concrete detail (flavour, workflow, city, price cue)
- exactly 3 adAngles, exactly 8 outreach scripts
- no live-ad claims, no guaranteed ROAS
- do not invent numbers: no discounts, prices, percentages, counts, times or results that are not in the brief or mix below. Write {{offer}} or {{price}} where the owner must fill one in
Brief + mix:
${JSON.stringify(computed)}`;
}

async function openAiCompat(
  url: string,
  key: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
  maxTokens = 1800
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.6,
      max_tokens: maxTokens,
      // gpt-oss models reason first; keep that short so the JSON fits the budget.
      ...(/gpt-oss/.test(model) ? { reasoning_effort: "low" } : {}),
      messages: [
        {
          role: "system",
          content: "You return strict JSON only. No markdown.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`LLM HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty LLM content");
  return content;
}

async function googleGenerate(
  url: string,
  key: string,
  prompt: string,
  signal: AbortSignal,
  maxTokens = 1800
): Promise<string> {
  // Key in a header, never in the URL.
  const res = await fetch(url, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: maxTokens,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const parts = json.candidates?.[0]?.content?.parts || [];
  const text = parts
    .filter((p) => !p.thought && p.text)
    .map((p) => p.text)
    .join("");
  if (!text) throw new Error("Empty Gemini content");
  return text;
}

function failNote(r: { failed: { provider: string; reason: string }[] } | null): string | null {
  return r && r.failed.length ? r.failed.map((f) => `${f.provider}: ${f.reason}`).join("; ") : null;
}

export async function recognizeWithLlm(
  input: PlanInput,
  site: SiteSnapshot,
  heuristic: ProductIntel
): Promise<{ used: boolean; provider: string | null; product: Partial<ProductIntel> | null; fallback?: string }> {
  const prompt = `Read this India product and return JSON only:
{
  "recognizedName": "",
  "summary": "2-3 sentences in English, facts only",
  "category": "food|saas|education|fashion|health|finance|ecommerce|local_service|entertainment|general",
  "priceTier": "low|mid|high|enterprise",
  "audience": "",
  "tone": "",
  "differentiators": [],
  "evidence": [],
  "confidence": 0.0
}
Do not invent a page you were not given. If scrape failed, use the form.
category = what the business SELLS, never who buys it. Audience words (college students, parents, founders) do not set the category.
Examples: "streetwear tees for college students" → fashion; "sweet shop" → food; "coding bootcamp" → education; "salon" → local_service.
Heuristic guess: ${JSON.stringify(heuristic)}
Form: ${JSON.stringify({ product_name: input.product_name, city: input.city, goal: input.goal, audience_age: input.audience_age, audience_notes: input.audience_notes, audience_language: input.language })}
Site: ${JSON.stringify({ title: site.title, description: site.description, h1: site.h1, jsonLdName: site.jsonLdName, jsonLdType: site.jsonLdType, excerpt: site.textExcerpt?.slice(0, 500), scraped: site.scraped })}`;
  const r = await generate(prompt, {
    budgetMs: RECOGNIZE_BUDGET_MS,
    maxTokens: 1800,
    parse: (c) => asProduct(extractJson(c)),
  });
  if (!r) return { used: false, provider: null, product: null };
  const note = failNote(r);
  if (!isGenerated(r)) return { used: false, provider: null, product: null, ...(note ? { fallback: note } : {}) };
  return { used: true, provider: r.provider, product: r.value, ...(note ? { fallback: note } : {}) };
}

export async function fillWithLlm(
  input: PlanInput,
  mix: ChannelAllocation[],
  intel: ProductIntel,
  site: SiteSnapshot
): Promise<LlmResult & { fallback?: string }> {
  const r = await generate(buildPrompt(input, mix, intel, site), {
    budgetMs: COPY_BUDGET_MS,
    maxTokens: 3000,
    parse: (c) => {
      const parsed = extractJson(c);
      const fill = asFill(parsed, mix);
      return fill ? { fill, product: asProduct(parsed) } : null;
    },
  });
  if (!r) return { used: false, provider: null, fill: null, product: null };
  const note = failNote(r);
  if (!isGenerated(r)) {
    return { used: false, provider: null, fill: null, product: null, ...(note ? { fallback: note } : {}) };
  }
  return { used: true, provider: r.provider, fill: r.value.fill, product: r.value.product, ...(note ? { fallback: note } : {}) };
}

export function mergeCreative(
  mix: ChannelAllocation[],
  base: CreativeFill,
  llm: CreativeFill | null
): { mix: ChannelAllocation[]; adAngles: PlanResult["adAngles"]; outreach: PlanResult["outreach"] } {
  const explanations = { ...base.explanations, ...(llm?.explanations || {}) };
  const nextMix = mix.map((row) => ({
    ...row,
    explanation: explanations[row.channelId] || row.explanation,
  }));
  const adAngles = (llm?.adAngles?.length ? [...llm.adAngles, ...base.adAngles] : base.adAngles).slice(0, 3);
  const outreach = (llm?.outreach?.length ? [...llm.outreach, ...base.outreach] : base.outreach).slice(0, 8);
  return { mix: nextMix, adAngles, outreach };
}

/** F7: fixture source for the launch-kit rewrite in mock mode (recorded from one real call). */
export const KIT_LLM_SOURCE = "llm_launch_kit";
export const KIT_MAX_TOKENS = 6000;

export interface KitRewrite {
  used: boolean;
  provider: string | null;
  texts: Record<string, string> | null;
  /** True when the words came from a recorded fixture (ADPILOT_MOCK_APIS=1). */
  mock?: boolean;
  /** Providers that failed first, e.g. "groq: timeout". */
  fallback?: string;
}

/** Prompt for the tone-only rewrite, English only. Numbers are frozen; the guard enforces it afterwards. */
export function kitRewritePrompt(texts: Record<string, string>, input: PlanInput, tone: string): string {
  return `Rewrite these launch-kit lines for the owner of "${input.product_name}" in ${input.city}.
Write in standard, simple English, the way you would explain it to a busy shop owner. No Hinglish, no Hindi/Tamil/other Indian-language words or scripts. Tone: ${tone}; short and direct.
Make each line sound like a person talking; do not just copy it.
Rules:
- keep each line's meaning and instructions
- keep every number exactly as written (prices, ages, times, counts, dates)
- do NOT add any new number, price, percentage, date, time, discount or claim
- keep brand names, channel names, place names and quoted search terms as written
Return JSON only: {"texts": {"<same key>": "<rewritten line>"}} with every key below.
Lines:
${JSON.stringify(texts)}`;
}

export function asTexts(data: unknown, keys: string[]): Record<string, string> | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const src = (obj.texts && typeof obj.texts === "object" ? obj.texts : obj) as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().slice(0, 400);
  }
  return Object.keys(out).length ? out : null;
}

/** Recorded LLM response shape in fixtures/api/llm_launch_kit/<product>.json. */
export interface RecordedLlm {
  provider: string;
  model: string;
  content: string;
}

/**
 * F7: rewords the deterministic kit for tone (English only). Groq first, Gemini
 * on failure/timeout. Mock mode replays a recorded response for this product
 * (or keeps the template). Never throws.
 */
export async function rewriteLaunchKit(
  texts: Record<string, string>,
  input: PlanInput,
  tone: string
): Promise<KitRewrite> {
  const keys = Object.keys(texts);
  if (isMockMode()) {
    const fx = await readFixture<RecordedLlm>(KIT_LLM_SOURCE, input.product_name);
    if (!fx) return { used: false, provider: null, texts: null };
    try {
      const out = asTexts(extractJson(fx.data.content), keys);
      return { used: Boolean(out), provider: fx.data.provider, texts: out, mock: true };
    } catch {
      return { used: false, provider: fx.data.provider, texts: null, mock: true };
    }
  }
  const r = await generate(kitRewritePrompt(texts, input, tone), {
    budgetMs: KIT_BUDGET_MS,
    maxTokens: KIT_MAX_TOKENS,
    parse: (c) => asTexts(extractJson(c), keys),
  });
  if (!r) return { used: false, provider: null, texts: null };
  const note = failNote(r);
  if (!isGenerated(r)) return { used: false, provider: null, texts: null, ...(note ? { fallback: note } : {}) };
  return { used: true, provider: r.provider, texts: r.value, ...(note ? { fallback: note } : {}) };
}
