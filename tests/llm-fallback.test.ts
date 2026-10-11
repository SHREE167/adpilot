import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import golden from "../eval/golden-briefs.json";
import { runAgent } from "@/lib/agent";
import { templateCreative } from "@/lib/copy-templates";
import { groundingRate, groundingSet, guardText, isEnglishText } from "@/lib/grounding-guard";
import { guardKitTexts, kitEvidence, kitTexts } from "@/lib/launch-kit";
import { asTexts, ECHO_SHARE, echoShare, extractJson, generate, llmProviders, parseKitRewrite, rewriteLaunchKit } from "@/lib/llm";
import type { PlanInput } from "@/lib/types";

const BRIEFS = (golden as { briefs: { id: string; expectedCategory: string; input: PlanInput }[] }).briefs;
const SNACK = BRIEFS.find((b) => b.id === "sig-3k-student")!;
const KEYS = ["GROQ_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "OPENAI_API_KEY", "ADPILOT_MOCK_APIS"];
const origFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = origFetch;
  for (const k of KEYS) delete process.env[k];
});

const groqOk = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const geminiOk = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

/** Hangs until the request is aborted (a timeout). */
function hang(init?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });
}

describe("LLM providers", () => {
  it("default (recognition) is Groq first; kit/copy order is Gemini first; OpenAI is never used", () => {
    process.env.OPENAI_API_KEY = "sk-x";
    assert.deepEqual(llmProviders(), []);
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "g";
    process.env.GROQ_API_KEY = "q";
    assert.deepEqual(
      llmProviders().map((p) => [p.provider, p.model]),
      [
        ["groq", "openai/gpt-oss-20b"],
        ["google", "gemini-3.5-flash-lite"],
      ]
    );
    assert.deepEqual(
      llmProviders("gemini-first").map((p) => p.provider),
      ["google", "groq"]
    );
  });

  it("no keys → null, no fetch", async () => {
    globalThis.fetch = (async () => {
      throw new Error("no fetch");
    }) as typeof fetch;
    assert.equal(await generate("x", { budgetMs: 500, maxTokens: 10, parse: (c) => c }), null);
  });
});

describe("generate: Groq → Gemini fallback", () => {
  function setBoth() {
    process.env.GROQ_API_KEY = "groq-secret";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "gemini-secret";
  }

  it("Groq HTTP 500 → Gemini answers; Gemini key in a header, not the URL", async () => {
    setBoth();
    const urls: string[] = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      urls.push(String(url));
      if (String(url).includes("groq")) return new Response("{}", { status: 500 });
      assert.equal((init?.headers as Record<string, string>)["x-goog-api-key"], "gemini-secret");
      return geminiOk('{"ok":true}');
    }) as typeof fetch;
    const r = await generate("x", { budgetMs: 2000, maxTokens: 10, parse: (c) => extractJson(c) });
    assert.ok(r && "value" in r);
    assert.equal(r.provider, "google");
    assert.match(r.failed[0].reason, /500/);
    assert.ok(urls.every((u) => !u.includes("secret")));
  });

  it("Groq times out → Gemini answers within the same budget", async () => {
    setBoth();
    globalThis.fetch = (async (url: string, init?: RequestInit) =>
      String(url).includes("groq") ? hang(init) : geminiOk('{"ok":1}')) as typeof fetch;
    const t0 = Date.now();
    const r = await generate("x", { budgetMs: 3500, maxTokens: 10, parse: (c) => extractJson(c) });
    assert.ok(r && "value" in r && r.provider === "google");
    assert.deepEqual(r.failed, [{ provider: "groq", reason: "timeout" }]);
    assert.ok(Date.now() - t0 < 3600);
  });

  it("Groq returns unusable JSON → Gemini", async () => {
    setBoth();
    globalThis.fetch = (async (url: string) =>
      String(url).includes("groq") ? groqOk("sorry, no json") : geminiOk('{"ok":1}')) as typeof fetch;
    const r = await generate("x", { budgetMs: 2000, maxTokens: 10, parse: (c) => extractJson(c) });
    assert.ok(r && "value" in r && r.provider === "google");
  });

  it("both fail → no value, reasons kept (caller uses the template)", async () => {
    setBoth();
    globalThis.fetch = (async () => new Response("{}", { status: 503 })) as typeof fetch;
    const r = await generate("x", { budgetMs: 2000, maxTokens: 10, parse: (c) => extractJson(c) });
    assert.ok(r && !("value" in r));
    assert.equal(r.failed.length, 2);
  });

  it("kit rewrite tries Gemini first; Groq only when Gemini fails", async () => {
    setBoth();
    const texts = { "whatsapp.metric": "Count chats, not likes." };
    const calls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url).includes("groq") ? "groq" : "google");
      return String(url).includes("groq")
        ? groqOk(JSON.stringify({ texts: { "whatsapp.metric": "Count the chats you get, not the likes." } }))
        : new Response("{}", { status: 429 });
    }) as typeof fetch;
    const r = await rewriteLaunchKit(texts, SNACK.input, "plain");
    assert.deepEqual(calls, ["google", "groq"]);
    assert.equal(r.used, true);
    assert.equal(r.provider, "groq");
    assert.match(r.fallback || "", /google/);
  });

  it("an echo (lines returned unchanged) is a failure: Gemini echoes → Groq rewrites", async () => {
    setBoth();
    const texts = {
      "whatsapp.metric": "Count chats, not likes.",
      "whatsapp.checklist.0": "Set a greeting and quick replies.",
    };
    globalThis.fetch = (async (url: string) =>
      String(url).includes("groq")
        ? groqOk(JSON.stringify({ texts: { "whatsapp.metric": "Count the chats, not the likes.", "whatsapp.checklist.0": "Add a greeting and quick replies." } }))
        : geminiOk(JSON.stringify({ texts: { "whatsapp.metric": "Count chats, not likes.", "whatsapp.checklist.0": "Set a greeting and quick replies." } }))) as typeof fetch;
    const r = await rewriteLaunchKit(texts, SNACK.input, "plain");
    assert.equal(r.provider, "groq");
    assert.match(r.fallback || "", /google: echo \(100% of lines unchanged\)/);
  });

  it("both echo → template wording (used: false), reasons kept", async () => {
    setBoth();
    const texts = { "whatsapp.metric": "Count chats, not likes." };
    const same = JSON.stringify({ texts });
    globalThis.fetch = (async (url: string) => (String(url).includes("groq") ? groqOk(same) : geminiOk(same))) as typeof fetch;
    const r = await rewriteLaunchKit(texts, SNACK.input, "plain");
    assert.equal(r.used, false);
    assert.match(r.fallback || "", /google: echo.*groq: echo/);
  });
});

describe("echo detection", () => {
  it("echoShare ignores hyphen style, spacing and case", () => {
    const input = { a: "Fri-Sun, 6pm-10pm.", b: "Count chats." };
    assert.equal(echoShare(input, { a: "Fri‑Sun,  6pm‑10pm.", b: "count chats." }), 1);
    assert.equal(echoShare(input, { a: "Fri to Sun, 6pm-10pm.", b: "Count chats." }), 0.5);
  });

  it("parseKitRewrite: >= 80% unchanged is an echo; below is a rewrite", () => {
    const input = { a: "one", b: "two", c: "three", d: "four", e: "five" };
    const echo = parseKitRewrite(JSON.stringify({ texts: { ...input, e: "FIVE!" } }), input);
    assert.ok(echo instanceof Error && /echo/.test(echo.message));
    const ok = parseKitRewrite(JSON.stringify({ texts: { ...input, d: "4th", e: "5th" } }), input);
    assert.ok(ok && !(ok instanceof Error));
    assert.equal(ECHO_SHARE, 0.8);
  });

  it("the recorded gpt-oss-20b response is an echo of the text it was sent", () => {
    const fx = JSON.parse(
      readFileSync(path.join(process.cwd(), "fixtures", "api", "llm_launch_kit", "campus-crunch-masala-peanuts.json"), "utf8")
    ) as { data: { content: string } };
    const out = (JSON.parse(fx.data.content) as { texts: Record<string, string> }).texts;
    // It was sent the older kit wording; compared with itself as input it is a 100% echo.
    const input = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.replace(/‑/g, "-")]));
    assert.equal(echoShare(input, out), 1);
  });
});

describe("mock replay order", () => {
  it("replays Gemini first for the demo brief", async () => {
    process.env.ADPILOT_MOCK_APIS = "1";
    const plan = await runAgent(SNACK.input);
    assert.equal(plan.launchKit!.wording, "google (recorded)");
    const span = plan.trace!.spans.find((s) => s.name === "launch_kit_llm")!;
    assert.equal(span.meta?.provider, "google");
  });
});

describe("English only", () => {
  it("isEnglishText: English passes; Hinglish and Indic scripts fail", () => {
    assert.ok(isEnglishText("Send clicks to WhatsApp and count chats, not likes. The plan assumes 1.5% CTR."));
    assert.ok(isEnglishText("Pin the offer to the Page with the map pin for Chennai."));
    assert.equal(isEnglishText("Clicks ko WhatsApp pe bhejo aur likes mat gino, chats count karo."), false);
    assert.equal(isEnglishText("WhatsApp-ல order பண்ணுங்க"), false);
    assert.equal(isEnglishText("अभी देखें"), false);
  });

  async function snackKit() {
    process.env.ADPILOT_MOCK_APIS = "1";
    const plan = await runAgent(SNACK.input);
    const { input, mix, totals, weeklyForecast, realityCheck, enrichment, zeroRupee, placements } = plan;
    const ev = groundingSet(
      { input, mix, totals, weeklyForecast, realityCheck, enrichment, zeroRupee, placements },
      kitEvidence(plan.launchKit!)
    );
    return { kit: plan.launchKit!, ev };
  }

  it("the recorded Gemini response (English-only prompt) passes the English check and the guard", async () => {
    const fx = JSON.parse(
      readFileSync(path.join(process.cwd(), "fixtures", "api", "llm_gemini", "campus-crunch-masala-peanuts.json"), "utf8")
    ) as { data: { provider: string; content: string } };
    assert.equal(fx.data.provider, "google");
    const { kit, ev } = await snackKit();
    const keys = Object.keys(kitTexts(kit));
    const texts = asTexts(extractJson(fx.data.content), keys)!;
    assert.ok(Object.keys(texts).length > 0, "lines parsed");
    const r = guardKitTexts(kit, texts, ev, guardText, isEnglishText);
    assert.equal(r.nonEnglish, 0);
    assert.deepEqual(r.removed, []);
  });

  it("Hinglish lines (from Gemini's first, pre-fix recording) are rejected and reverted", async () => {
    const { kit, ev } = await snackKit();
    const reels = kit.channels.find((c) => c.channelId === "instagram_reels")!;
    const texts = {
      "instagram_reels.metric": "Clicks ko WhatsApp pe bhejo aur likes mat gino, chats count karo.",
      "instagram_reels.targeting": "Chennai ke 18-24 age wale, jinhe Snack food aur Street food pasand hai.",
    };
    const r = guardKitTexts(kit, texts, ev, guardText, isEnglishText);
    assert.equal(r.nonEnglish, 2);
    const out = r.kit.channels.find((c) => c.channelId === "instagram_reels")!;
    assert.equal(out.metric.why, reels.metric.why);
    assert.equal(out.targeting.text, reels.targeting.text);
  });

  it("Tamil/Hindi briefs still get English template copy", () => {
    for (const b of BRIEFS.filter((x) => x.input.language !== "English")) {
      const fill = templateCreative(b.input, [], b.expectedCategory, "low");
      const all = [...fill.adAngles.flatMap((a) => [a.headline, a.primaryText, a.cta]), ...fill.outreach.flatMap((o) => [o.title, o.body])];
      assert.ok(all.every(isEnglishText), b.id);
    }
  });
});

describe("template scripts: no invented numbers", () => {
  it("ad angles + outreach + explanations are 100% traceable for every golden brief", async () => {
    process.env.ADPILOT_MOCK_APIS = "1";
    for (const b of BRIEFS) {
      const plan = await runAgent(b.input);
      const { input, mix, totals, weeklyForecast, realityCheck, enrichment, zeroRupee, placements } = plan;
      const ev = groundingSet({ input, mix, totals, weeklyForecast, realityCheck, enrichment, zeroRupee, placements });
      const texts = [
        ...plan.mix.map((m) => m.explanation),
        ...plan.adAngles.flatMap((a) => [a.headline, a.primaryText, a.cta]),
        ...plan.outreach.flatMap((o) => [o.title, o.body]),
      ];
      const r = groundingRate(texts, ev);
      assert.equal(r.rate, 1, `${b.id}: ${r.grounded}/${r.total}`);
    }
  });

  it("no made-up offers survive in the templates", () => {
    const fill = templateCreative(SNACK.input, [], "food", "low");
    const blob = JSON.stringify(fill);
    assert.ok(!/% off|First \d+|\d+\s?(packs|min|seconds|days)/i.test(blob), blob);
  });
});
