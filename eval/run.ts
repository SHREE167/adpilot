// F16 eval harness v0: `npm run eval` (scripts/run-eval.mjs sets mock mode,
// clears keys). Runs the v1 path (no enrichment) and v2 on the same golden
// briefs, prints a scorecard and writes eval/report.md. Offline only.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { runAgent } from "@/lib/agent";
import { extractFeatures } from "@/lib/ml/features";
import { predictChannelScore, rawChannelScore } from "@/lib/ml/infer";
import { CHANNEL_IDS, type PlanInput, type PlanResult } from "@/lib/types";
import golden from "./golden-briefs.json";
import {
  ablationAdditive,
  categoryAccuracy,
  groundedFacts,
  jaccardDistance,
  meanPairwiseJaccard,
  mixChannels,
  mixSumsToBudget,
  pctOf,
  percentile,
  planEvidence,
  rangeChecks,
  guardedTexts,
  kitText,
  meanPairwiseSimilarity,
  copyTexts,
} from "./metrics";
import { groundingRate, isEnglishText } from "@/lib/grounding-guard";

interface Brief {
  id: string;
  label: string;
  /** What the business sells (not who buys it). */
  expectedCategory?: string;
  input: PlanInput;
}

type Variant = "v1" | "v2";

interface Run {
  brief: Brief;
  plan: PlanResult;
  ms: number;
}

const BRIEFS = (golden as { briefs: Brief[] }).briefs;
const SIGNATURE = ["sig-3k-student", "sig-40k-b2b"] as const;

if (process.env.ADPILOT_MOCK_APIS !== "1") {
  console.error("eval runs in mock mode only: use `npm run eval`.");
  process.exit(1);
}

async function runAll(variant: Variant): Promise<Run[]> {
  const out: Run[] = [];
  for (const brief of BRIEFS) {
    const t0 = performance.now();
    const plan = await runAgent(brief.input, { baseline: variant === "v1" });
    out.push({ brief, plan, ms: performance.now() - t0 });
  }
  return out;
}

interface Scores {
  category: ReturnType<typeof categoryAccuracy>;
  specificity: number;
  factsTotal: number;
  diversity: number;
  uniqueMixes: number;
  signature: number;
  realityCount: number;
  verdicts: Record<string, number>;
  additivity: string;
  additivityPct: number;
  p50: number;
  p95: number;
  mixSumOk: number;
  /** v2: launch-kit text similarity; v1: template copy similarity (no kit). */
  textSimilarity: number;
  hasKit: boolean;
  grounding: { grounded: number; total: number };
  guard: { checked: number; removed: number };
  /** Copy + outreach numbers traceable (both variants share the template scripts). */
  copy: { grounded: number; total: number };
  english: { ok: number; total: number };
  /** F14 */
  ranges: { checked: number; ordered: number; signalBands: number; poolOk: number };
}

function score(runs: Run[], variant: Variant): Scores {
  const facts = runs.map((r) => groundedFacts(r.plan).length);
  const mixes = runs.map((r) => mixChannels(r.plan));
  const byId = new Map(runs.map((r) => [r.brief.id, r]));
  const [a, b] = SIGNATURE.map((id) => byId.get(id)!.plan);
  const verdicts: Record<string, number> = {};
  for (const r of runs) {
    const v = r.plan.realityCheck?.verdict;
    if (v) verdicts[v] = (verdicts[v] || 0) + 1;
  }
  let additivity: string;
  let additivityPct: number;
  if (variant === "v1") {
    let ok = 0;
    let n = 0;
    for (const r of runs) {
      const x = extractFeatures(r.plan.input, r.plan.category, r.plan.priceTier);
      for (const ch of CHANNEL_IDS) {
        n++;
        if (ablationAdditive((xx) => predictChannelScore(ch, xx), x)) ok++;
      }
    }
    additivityPct = pctOf(ok, n);
    additivity = `${additivityPct}% (zero-ablation, ${n} checks)`;
  } else {
    // Exact TreeSHAP: the stored waterfall must add up to the model's own output.
    let ok = 0;
    let n = 0;
    for (const r of runs) {
      const x = extractFeatures(r.plan.input, r.plan.category, r.plan.priceTier);
      for (const c of r.plan.shap?.channels || []) {
        n++;
        const total = c.base + c.drivers.reduce((s, d) => s + d.value, 0) + c.other;
        const raw = rawChannelScore(c.channelId, x);
        if (Math.abs(total - c.prediction) <= 1e-3 && Math.abs(c.prediction - raw) <= 1e-3) ok++;
      }
    }
    additivityPct = pctOf(ok, n);
    additivity = `${additivityPct}% (TreeSHAP, ${n} checks)`;
  }
  const ms = runs.map((r) => r.ms);
  const category = categoryAccuracy(
    runs.map((r) => ({ id: r.brief.id, expected: r.brief.expectedCategory, actual: r.plan.category }))
  );
  return {
    category,
    specificity: facts.reduce((s, n) => s + n, 0) / runs.length,
    factsTotal: facts.reduce((s, n) => s + n, 0),
    diversity: meanPairwiseJaccard(mixes),
    uniqueMixes: new Set(mixes.map((m) => m.join(","))).size,
    signature: jaccardDistance(mixChannels(a), mixChannels(b)),
    realityCount: runs.filter((r) => r.plan.realityCheck).length,
    verdicts,
    additivity,
    additivityPct,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    mixSumOk: runs.filter((r) => mixSumsToBudget(r.plan)).length,
    ...textScores(runs),
    ranges: runs.reduce(
      (acc, r) => {
        const c = rangeChecks(r.plan);
        return {
          checked: acc.checked + c.checked,
          ordered: acc.ordered + c.ordered,
          signalBands: acc.signalBands + c.signalBands,
          poolOk: acc.poolOk + (c.poolOk ? 1 : 0),
        };
      },
      { checked: 0, ordered: 0, signalBands: 0, poolOk: 0 }
    ),
  };
}

function textScores(runs: Run[]): Pick<Scores, "textSimilarity" | "hasKit" | "grounding" | "guard" | "copy" | "english"> {
  const hasKit = runs.some((r) => r.plan.launchKit);
  const texts = runs.map((r) =>
    hasKit
      ? kitText(r.plan)
      : [...r.plan.adAngles.map((a) => `${a.headline} ${a.primaryText}`), ...r.plan.outreach.map((o) => o.body)].join("\n")
  );
  const grounding = { grounded: 0, total: 0 };
  const copy = { grounded: 0, total: 0 };
  const english = { ok: 0, total: 0 };
  const guard = { checked: 0, removed: 0 };
  for (const r of runs) {
    const ev = planEvidence(r.plan);
    const g = groundingRate(guardedTexts(r.plan), ev);
    grounding.grounded += g.grounded;
    grounding.total += g.total;
    const c = groundingRate(copyTexts(r.plan), ev);
    copy.grounded += c.grounded;
    copy.total += c.total;
    for (const t of guardedTexts(r.plan)) {
      english.total++;
      if (isEnglishText(t)) english.ok++;
    }
    const span = r.plan.trace?.spans.find((s) => s.name === "grounding_guard" && s.status === "ok");
    guard.checked += Number(span?.meta?.checked ?? 0);
    guard.removed += Number(span?.meta?.removed ?? 0);
  }
  return { textSimilarity: meanPairwiseSimilarity(texts), hasKit, grounding, guard, copy, english };
}

function git(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const verdictText = (v: Record<string, number>) =>
  Object.keys(v).length
    ? ["healthy", "tight", "likely_loss"].map((k) => `${k.replace("_", " ")} ${v[k] || 0}`).join(", ")
    : "—";

async function main() {
  // Warm-up: module load and first-call JIT are not plan latency.
  await runAgent(BRIEFS[0].input, { baseline: true });

  const v1 = await runAll("v1");
  const v2 = await runAll("v2");
  const s1 = score(v1, "v1");
  const s2 = score(v2, "v2");
  const n = BRIEFS.length;

  const hash = git("git rev-parse --short HEAD") || "unknown";
  const dirty = git("git status --porcelain") ? " (uncommitted changes)" : "";
  const now = new Date();

  const acc = (s: Scores) =>
    `${pctOf(s.category.correct, s.category.total)}% (${s.category.correct}/${s.category.total})`;
  const rows: [string, string, string][] = [
    ["Category accuracy (vs expectedCategory)", acc(s1), acc(s2)],
    ["Specificity (grounded facts / plan)", f1(s1.specificity), f1(s2.specificity)],
    ["Diversity (mean Jaccard distance of mixes)", f2(s1.diversity), f2(s2.diversity)],
    ["Unique channel mixes", `${s1.uniqueMixes} / ${n}`, `${s2.uniqueMixes} / ${n}`],
    [
      "Signature: ₹3k student vs ₹40k B2B (Jaccard)",
      `${f2(s1.signature)} ${s1.signature > 0 ? "pass" : "FAIL"}`,
      `${f2(s2.signature)} ${s2.signature > 0 ? "pass" : "FAIL"}`,
    ],
    [
      "Reality coverage (briefs with a verdict)",
      `${pctOf(s1.realityCount, n)}% (${s1.realityCount}/${n})`,
      `${pctOf(s2.realityCount, n)}% (${s2.realityCount}/${n})`,
    ],
    ["Reality verdicts", verdictText(s1.verdicts), verdictText(s2.verdicts)],
    ["Explanation additivity (base + Σ = score)", s1.additivity, s2.additivity],
    ["Latency p50 / p95 (ms, offline mock)", `${f1(s1.p50)} / ${f1(s1.p95)}`, `${f1(s2.p50)} / ${f1(s2.p95)}`],
    ["Mix sums to budget", `${s1.mixSumOk} / ${n}`, `${s2.mixSumOk} / ${n}`],
    [
      "Ranges ordered (low ≤ mid ≤ high)",
      `${pctOf(s1.ranges.ordered, s1.ranges.checked)}% (${s1.ranges.ordered}/${s1.ranges.checked})`,
      `${pctOf(s2.ranges.ordered, s2.ranges.checked)}% (${s2.ranges.ordered}/${s2.ranges.checked})`,
    ],
    [
      "Reach bands backed by a signal (Meta pool) / high within pool",
      `${s1.ranges.signalBands} / ${s1.ranges.poolOk} of ${n}`,
      `${s2.ranges.signalBands} / ${s2.ranges.poolOk} of ${n}`,
    ],
    [
      "Launch-kit text similarity (3-gram Jaccard, lower = more specific)",
      s1.hasKit ? f2(s1.textSimilarity) : `— no kit (v1 template copy: ${f2(s1.textSimilarity)})`,
      s2.hasKit ? f2(s2.textSimilarity) : "—",
    ],
    [
      "Grounding rate (numbers in kit + copy + outreach traceable)",
      `${pctOf(s1.grounding.grounded, s1.grounding.total)}% (${s1.grounding.grounded}/${s1.grounding.total})`,
      `${pctOf(s2.grounding.grounded, s2.grounding.total)}% (${s2.grounding.grounded}/${s2.grounding.total})`,
    ],
    ["Guard: numbers checked / removed (kit rewrite + copy)", "— (no guard)", `${s2.guard.checked} / ${s2.guard.removed}`],
    [
      "Ad copy + outreach scripts: numbers traceable",
      `${pctOf(s1.copy.grounded, s1.copy.total)}% (${s1.copy.grounded}/${s1.copy.total})`,
      `${pctOf(s2.copy.grounded, s2.copy.total)}% (${s2.copy.grounded}/${s2.copy.total})`,
    ],
    [
      "English-only lines (kit + copy + outreach)",
      `${pctOf(s1.english.ok, s1.english.total)}% (${s1.english.ok}/${s1.english.total})`,
      `${pctOf(s2.english.ok, s2.english.total)}% (${s2.english.ok}/${s2.english.total})`,
    ],
  ];

  const table = [
    "| Metric | v1 (enrichment off) | v2 |",
    "| --- | --- | --- |",
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");

  const v1ById = new Map(v1.map((r) => [r.brief.id, r]));
  const perBrief = [
    "| Brief | Budget | Goal | Category | v2 mix | Same as v1 | Facts | Verdict |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...v2.map((r) => {
      const base = v1ById.get(r.brief.id)!.plan;
      const same = mixChannels(base).join() === mixChannels(r.plan).join();
      const rc = r.plan.realityCheck;
      return `| ${r.brief.label} | ₹${r.brief.input.budget.toLocaleString("en-IN")} | ${r.brief.input.goal} | ${r.plan.category}${r.brief.expectedCategory && r.brief.expectedCategory !== r.plan.category ? ` ✗ (expected ${r.brief.expectedCategory})` : ""} |${r.plan.mix.map((m) => `${m.name} ${Math.round(m.percent)}%`).join(", ")} | ${same ? "yes" : "no"} | ${groundedFacts(r.plan).length} | ${rc ? rc.verdict.replace("_", " ") : "—"} |`;
    }),
  ].join("\n");

  const report = `# AdPilot eval report (F16, M4)

- **Date:** ${now.toISOString().slice(0, 10)} (${now.toISOString()})
- **Git:** \`${hash}\`${dirty}
- **Briefs:** ${n} (\`eval/golden-briefs.json\`)
- **Mode:** \`ADPILOT_MOCK_APIS=1\`, no API keys, no network, no LLM (template copy)

## v1 vs v2

${table}

## Per brief (v2)

${perBrief}

## How to read this

- **v1** is \`runAgent(input, { baseline: true })\`: no enrichment step, no season adjust, no zero-rupee layer, no reality check. Its mix is the v1 mix.
- **Category accuracy** compares the recognized category (heuristic only here; no LLM in eval) with each brief's hand-labelled \`expectedCategory\`: what the business sells, not who buys it. The labels were written alongside the M4 recognizer fix, so 100% here is a regression floor, not proof of generalisation.
- **Specificity** counts facts a plan cites that trace to an ok signal or to the user's own numbers: readiness fixes, festivals, festival-priced weeks, Google Places facts, YouTube creators and the Meta audience pool + interests (each only when the query names the brief's city; the Meta fixture is hand-written until \`npm run record -- meta\` replaces it), zero-rupee items that cite a source, and the break-even verdict. Mock fixtures stand in for live APIs here.
- **Diversity** is the mean pairwise Jaccard distance between the channel sets of all briefs (0 = every plan picks the same channels, 1 = no overlap).
- **Explanation additivity** checks that the explanation adds up to the score. v1's zero-ablation uses an all-zero baseline over all 25 features. v2 uses exact TreeSHAP (Lundberg et al. 2018) over per-node cover: average score + Σ drivers + other features must equal the model's raw output within 1e-3.
- **Latency** is \`runAgent\` wall time on this machine in offline mock mode, after one warm-up run; production adds the real scrape and API calls.
- Channel picks are the same in v1 and v2 (signals change prices, reach caps and words, not the scorer), so mix diversity matches. The critic (F12) and explore slice (F20) are what move it later. The Meta reach cap (F4) only binds when forecast reach exceeds the pool, which these mock budgets never do.
- **Ranges (F14)**: every reach / clicks / conversions forecast is low / mid / high. Default band ±30% on rate-card math; Facebook + Instagram reach narrows to ±15% when the Meta pool signal is ok, with the combined high capped at the pool. Totals sum the channel lows/mids/highs. The eval fails if any range is out of order or a Meta-backed high exceeds the pool.
- **Launch-kit text similarity** is the mean pairwise Jaccard similarity of word 3-gram sets of each plan's launch-kit text (lower = less boilerplate shared across briefs). v1 has no kit; its column shows the same measure over v1's template ad copy for reference.
- **Grounding rate** extracts every number (₹, K/L/Cr/M, %, times, Indian digit scripts) from the launch kit, ad angles, outreach scripts and channel explanations and checks it against the plan's structured numbers and the signals, at the precision shown. Free text is never evidence. It proves numbers trace to the plan, not that they are used correctly: small integers (weeks, ages) are usually traceable.
- **Guard: checked / removed** sums the \`grounding_guard\` trace span: every v2 plan's ad copy and outreach, plus the launch-kit rewrite when an LLM wrote it. In eval only the demo brief has a rewrite: a real Gemini response recorded by \`npm run record -- gemini\` and replayed offline. A real Gemini response (\`npm run record -- gemini\`) is kept in \`fixtures/api/llm_gemini/\` for the fallback tests; with the English-only prompt it is English and passes the guard (Gemini's first, pre-fix answer was Hinglish and is kept inline in the tests as a rejection case). The launch-kit rewrite is Gemini first: mock mode replays the Gemini recording, then Groq's, with the same echo rule (80%+ unchanged lines = failure). gpt-oss-20b returned its input unchanged in all three of its recordings.
- **Ad copy + outreach scripts** are the template scripts (no LLM in eval). Since M4 they contain no invented offers or numbers: the owner fills \`{{offer}}\` / \`{{price}}\`. Before the fix they traced 74% in v1 (168/227) because of lines like "10% off on 3+ packs".
- **English-only lines** checks every kit, copy and outreach line with \`isEnglishText\` (no Indic script, no Hinglish function words). The form's language describes the audience only.
`;

  writeFileSync(path.join(process.cwd(), "eval", "report.md"), report);
  console.log(`\nAdPilot eval (${n} briefs, mock mode, git ${hash}${dirty})\n`);
  console.log(table);
  if (s2.category.misses.length) {
    console.log(`\nCategory misses: ${s2.category.misses.map((m) => `${m.id} ${m.actual}≠${m.expected}`).join(", ")}`);
  }
  console.log("\nWrote eval/report.md");

  const failures: string[] = [];
  for (const [name, s] of [["v1", s1], ["v2", s2]] as const) {
    if (s.mixSumOk !== n) failures.push(`${name}: ${n - s.mixSumOk} mix(es) do not sum to the budget`);
    if (!(s.signature > 0)) failures.push(`${name}: signature briefs produced the same mix`);
  }
  for (const [name, s] of [["v1", s1], ["v2", s2]] as const) {
    if (s.ranges.ordered !== s.ranges.checked) failures.push(`${name}: ${s.ranges.checked - s.ranges.ordered} range(s) not low <= mid <= high`);
    if (s.ranges.poolOk !== n) failures.push(`${name}: Meta-backed reach high above the pool`);
  }
  if (s2.grounding.total && s2.grounding.grounded < s2.grounding.total) {
    failures.push(`v2: grounding ${pctOf(s2.grounding.grounded, s2.grounding.total)}% (must be 100%)`);
  }
  if (s2.additivityPct < 100) failures.push(`v2: TreeSHAP additivity ${s2.additivityPct}% (must be 100%)`);
  if (failures.length) {
    console.error(`\nEval FAILED:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
