// F16 eval harness v0: `npm run eval` (scripts/run-eval.mjs sets mock mode,
// clears keys). Runs the v1 path (no enrichment) and v2 on the same golden
// briefs, prints a scorecard and writes eval/report.md. Offline only.
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { runAgent } from "@/lib/agent";
import { extractFeatures } from "@/lib/ml/features";
import { predictChannelScore } from "@/lib/ml/infer";
import { CHANNEL_IDS, type PlanInput, type PlanResult } from "@/lib/types";
import golden from "./golden-briefs.json";
import {
  ablationAdditive,
  groundedFacts,
  jaccardDistance,
  meanPairwiseJaccard,
  mixChannels,
  mixSumsToBudget,
  pctOf,
  percentile,
} from "./metrics";

interface Brief {
  id: string;
  label: string;
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
  specificity: number;
  factsTotal: number;
  diversity: number;
  uniqueMixes: number;
  signature: number;
  realityCount: number;
  verdicts: Record<string, number>;
  additivity: string;
  p50: number;
  p95: number;
  mixSumOk: number;
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
    additivity = `${pctOf(ok, n)}% (zero-ablation, ${n} checks)`;
  } else {
    additivity = "n/a (model has no cover yet)";
  }
  const ms = runs.map((r) => r.ms);
  return {
    specificity: facts.reduce((s, n) => s + n, 0) / runs.length,
    factsTotal: facts.reduce((s, n) => s + n, 0),
    diversity: meanPairwiseJaccard(mixes),
    uniqueMixes: new Set(mixes.map((m) => m.join(","))).size,
    signature: jaccardDistance(mixChannels(a), mixChannels(b)),
    realityCount: runs.filter((r) => r.plan.realityCheck).length,
    verdicts,
    additivity,
    p50: percentile(ms, 50),
    p95: percentile(ms, 95),
    mixSumOk: runs.filter((r) => mixSumsToBudget(r.plan)).length,
  };
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

  const rows: [string, string, string][] = [
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
      return `| ${r.brief.label} | ₹${r.brief.input.budget.toLocaleString("en-IN")} | ${r.brief.input.goal} | ${r.plan.category} | ${r.plan.mix.map((m) => `${m.name} ${Math.round(m.percent)}%`).join(", ")} | ${same ? "yes" : "no"} | ${groundedFacts(r.plan).length} | ${rc ? rc.verdict.replace("_", " ") : "—"} |`;
    }),
  ].join("\n");

  const report = `# AdPilot eval report (F16 v0)

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
- **Specificity** counts facts a plan cites that trace to an ok signal or to the user's own numbers: readiness fixes, festivals, festival-priced weeks, Google Places facts (only when the query names the brief's city), zero-rupee items that cite a source, and the break-even verdict. Mock fixtures stand in for live APIs here.
- **Diversity** is the mean pairwise Jaccard distance between the channel sets of all briefs (0 = every plan picks the same channels, 1 = no overlap).
- **Explanation additivity** checks that the explanation adds up to the score. v1's zero-ablation uses an all-zero baseline over all 25 features. v2 uses exact TreeSHAP once \`ml/model.json\` has per-node cover (F9).
- **Latency** is \`runAgent\` wall time on this machine in offline mock mode, after one warm-up run; production adds the real scrape and API calls.
- M3 does not change which channels are picked (only festival pricing touches allocation), so v1 and v2 diversity are expected to match. The live audience caps (F4), critic (F12) and explore slice (F20) are what move diversity later.
`;

  writeFileSync(path.join(process.cwd(), "eval", "report.md"), report);
  console.log(`\nAdPilot eval (${n} briefs, mock mode, git ${hash}${dirty})\n`);
  console.log(table);
  console.log("\nWrote eval/report.md");

  const failures: string[] = [];
  for (const [name, s] of [["v1", s1], ["v2", s2]] as const) {
    if (s.mixSumOk !== n) failures.push(`${name}: ${n - s.mixSumOk} mix(es) do not sum to the budget`);
    if (!(s.signature > 0)) failures.push(`${name}: signature briefs produced the same mix`);
  }
  if (failures.length) {
    console.error(`\nEval FAILED:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
