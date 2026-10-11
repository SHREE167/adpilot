import "server-only";
import type { CreativeFill } from "./copy-templates";
import type {
  ChannelAllocation,
  PlanInput,
  PlanResult,
  ProductIntel,
  SiteSnapshot,
} from "./types";

const LLM_TIMEOUT_MS = 6000;

export interface LlmResult {
  used: boolean;
  provider: string | null;
  fill: CreativeFill | null;
  product: Partial<ProductIntel> | null;
}

function firstKey(): { provider: string; key: string; url: string; model: string } | null {
  const groq = process.env.GROQ_API_KEY;
  if (groq) {
    return {
      provider: "groq",
      key: groq,
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    };
  }
  const openai = process.env.OPENAI_API_KEY;
  if (openai) {
    return {
      provider: "openai",
      key: openai,
      url: "https://api.openai.com/v1/chat/completions",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    };
  }
  const google = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (google) {
    return {
      provider: "google",
      key: google,
      url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
      model: process.env.GOOGLE_MODEL || "gemini-2.0-flash",
    };
  }
  return null;
}

function extractJson(text: string): unknown {
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
    language: input.language,
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
Write in ${input.language}.
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
Brief + mix:
${JSON.stringify(computed)}`;
}

async function openAiCompat(
  url: string,
  key: string,
  model: string,
  prompt: string,
  signal: AbortSignal
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
      max_tokens: 1800,
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
  signal: AbortSignal
): Promise<string> {
  const res = await fetch(`${url}?key=${encodeURIComponent(key)}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.6,
        maxOutputTokens: 1800,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini content");
  return text;
}

export async function recognizeWithLlm(
  input: PlanInput,
  site: SiteSnapshot,
  heuristic: ProductIntel
): Promise<{ used: boolean; provider: string | null; product: Partial<ProductIntel> | null }> {
  const cfg = firstKey();
  if (!cfg) return { used: false, provider: null, product: null };
  const prompt = `Read this India product and return JSON only:
{
  "recognizedName": "",
  "summary": "2-3 sentences, facts only",
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
Form: ${JSON.stringify({ product_name: input.product_name, city: input.city, goal: input.goal, audience_age: input.audience_age, audience_notes: input.audience_notes, language: input.language })}
Site: ${JSON.stringify({ title: site.title, description: site.description, h1: site.h1, jsonLdName: site.jsonLdName, jsonLdType: site.jsonLdType, excerpt: site.textExcerpt?.slice(0, 500), scraped: site.scraped })}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const text =
      cfg.provider === "google"
        ? await googleGenerate(cfg.url, cfg.key, prompt, controller.signal)
        : await openAiCompat(cfg.url, cfg.key, cfg.model, prompt, controller.signal);
    const product = asProduct(extractJson(text));
    return { used: Boolean(product), provider: cfg.provider, product };
  } catch {
    return { used: false, provider: cfg.provider, product: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function fillWithLlm(
  input: PlanInput,
  mix: ChannelAllocation[],
  intel: ProductIntel,
  site: SiteSnapshot
): Promise<LlmResult> {
  const cfg = firstKey();
  if (!cfg) return { used: false, provider: null, fill: null, product: null };

  const prompt = buildPrompt(input, mix, intel, site);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

  try {
    const text =
      cfg.provider === "google"
        ? await googleGenerate(cfg.url, cfg.key, prompt, controller.signal)
        : await openAiCompat(cfg.url, cfg.key, cfg.model, prompt, controller.signal);
    const parsed = extractJson(text);
    const fill = asFill(parsed, mix);
    const product = asProduct(parsed);
    if (!fill) return { used: false, provider: cfg.provider, fill: null, product };
    return { used: true, provider: cfg.provider, fill, product };
  } catch {
    return { used: false, provider: cfg.provider, fill: null, product: null };
  } finally {
    clearTimeout(timer);
  }
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
