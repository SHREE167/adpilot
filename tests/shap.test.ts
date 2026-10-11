import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SNACK_CHENNAI } from "@/lib/fixtures";
import { describeFeature, FEATURE_LABELS } from "@/lib/ml/feature-labels";
import { ML_FEATURE_NAMES } from "@/lib/ml/features";
import { hasCover, shapValues, treeExpectation, type ShapNode } from "@/lib/ml/shap";

/** Deterministic PRNG (mulberry32) so failures reproduce. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random tree with consistent covers (parent = yes + no), features may repeat on a path. */
function randomTree(r: () => number, nFeatures: number, depth: number): ShapNode {
  if (depth === 0 || r() < 0.15) {
    return { leaf: Math.round((r() * 20 - 10) * 1000) / 1000, cover: 1 + Math.floor(r() * 50) };
  }
  const yes = randomTree(r, nFeatures, depth - 1);
  const no = randomTree(r, nFeatures, depth - 1);
  return {
    index: Math.floor(r() * nFeatures),
    threshold: Math.round(r() * 100) / 100,
    cover: yes.cover + no.cover,
    yes,
    no,
  };
}

/** Algorithm 1 (EXPVALUE): E[f(x) | x_S] with path-dependent cover weighting. */
function condExpectation(node: ShapNode, x: number[], S: Set<number>): number {
  if ("leaf" in node) return node.leaf;
  if (S.has(node.index)) {
    return condExpectation(x[node.index] < node.threshold ? node.yes : node.no, x, S);
  }
  return (
    (node.yes.cover * condExpectation(node.yes, x, S) + node.no.cover * condExpectation(node.no, x, S)) /
    node.cover
  );
}

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

/** Classic Shapley values by enumerating every coalition. */
function bruteForceShap(trees: ShapNode[], x: number[]): number[] {
  const M = x.length;
  const v = (S: Set<number>) => trees.reduce((s, t) => s + condExpectation(t, x, S), 0);
  const phi = new Array<number>(M).fill(0);
  for (let i = 0; i < M; i++) {
    const others = [...Array(M).keys()].filter((j) => j !== i);
    for (let mask = 0; mask < 1 << others.length; mask++) {
      const S = new Set(others.filter((_, b) => mask & (1 << b)));
      const weight = (factorial(S.size) * factorial(M - S.size - 1)) / factorial(M);
      const withI = new Set(S);
      withI.add(i);
      phi[i] += weight * (v(withI) - v(S));
    }
  }
  return phi;
}

describe("exact TreeSHAP (F9, Lundberg et al. 2018 Algorithm 2)", () => {
  it("matches brute-force Shapley values on random trees", () => {
    const r = rng(2026);
    for (let trial = 0; trial < 40; trial++) {
      const nFeatures = 2 + Math.floor(r() * 5);
      const trees = Array.from({ length: 1 + Math.floor(r() * 4) }, () => randomTree(r, nFeatures, 4));
      const x = Array.from({ length: nFeatures }, () => Math.round(r() * 100) / 100);
      const got = shapValues({ base_score: 0.5, trees }, x);
      const want = bruteForceShap(trees, x);
      want.forEach((w, i) => assert.ok(Math.abs(got.phi[i] - w) < 1e-9, `trial ${trial} f${i}: ${got.phi[i]} vs ${w}`));
    }
  });

  it("is additive: base + Σ phi == raw prediction", () => {
    const r = rng(7);
    for (let trial = 0; trial < 40; trial++) {
      const trees = Array.from({ length: 10 }, () => randomTree(r, 25, 4));
      const x = Array.from({ length: 25 }, () => r());
      const { base, phi, prediction } = shapValues({ base_score: 50, trees }, x);
      assert.ok(Math.abs(base + phi.reduce((s, p) => s + p, 0) - prediction) < 1e-9);
    }
  });

  it("base is the cover-weighted expectation; unused features get 0", () => {
    const tree: ShapNode = {
      index: 0,
      threshold: 0.5,
      cover: 4,
      yes: { leaf: 10, cover: 3 },
      no: { leaf: 2, cover: 1 },
    };
    assert.equal(treeExpectation(tree), 8);
    const s = shapValues({ base_score: 1, trees: [tree] }, [0.9, 0.2]);
    assert.equal(s.base, 9);
    assert.equal(s.prediction, 3);
    assert.deepEqual(s.phi, [-6, 0]);
  });

  it("hasCover rejects trees without cover", () => {
    assert.equal(hasCover({ leaf: 1, cover: 2 }), true);
    assert.equal(hasCover({ leaf: 1 } as ShapNode), false);
  });
});

describe("TreeSHAP on the shipped XGBoost model (F9)", () => {
  it("base + Σ SHAP == prediction within 1e-3 for every channel on every self-check row", async () => {
    const model = (await import("@/ml/model.json")).default as unknown as {
      channels: string[];
      models: Record<string, { base_score: number; trees: ShapNode[] }>;
      self_check: { x: number[]; y: number[] }[];
    };
    assert.ok(model.self_check.length >= 3);
    for (const row of model.self_check) {
      model.channels.forEach((ch, i) => {
        const m = model.models[ch];
        assert.ok(m.trees.every(hasCover), `${ch} has cover`);
        const { base, phi, prediction } = shapValues(m, row.x, ML_FEATURE_NAMES.length);
        const sum = base + phi.reduce((s, p) => s + p, 0);
        assert.ok(Math.abs(sum - prediction) < 1e-3, `${ch}: ${sum} vs ${prediction}`);
        // self_check y is the clamp-free model output rounded to 5 dp.
        assert.ok(Math.abs(prediction - row.y[i]) < 1e-3, `${ch}: ${prediction} vs ${row.y[i]}`);
      });
    }
  });

  it("runtime self-check (cover + additivity) passes", async () => {
    const { assertModelSelfCheck } = await import("@/lib/ml/infer");
    assert.doesNotThrow(() => assertModelSelfCheck());
  });

  it("explainScore keeps its signature and reads as SHAP drivers", async () => {
    const { explainScore } = await import("@/lib/ml/infer");
    const { extractFeatures } = await import("@/lib/ml/features");
    const x = extractFeatures(SNACK_CHENNAI, "food", "low");
    const reasons = explainScore("instagram_reels", x);
    assert.equal(reasons.length, 4);
    assert.match(reasons[0], /^XGBoost score \d+\/100 \(average \d+\.\d\)$/);
    for (const r of reasons.slice(1)) assert.match(r, /(lifts|lowers) this channel \([+-]\d+\.\d\)$/);
  });

  it("runAgent stores plan.shap; drivers + other add up to each prediction", async () => {
    const { runAgent } = await import("@/lib/agent");
    const plan = await runAgent(SNACK_CHENNAI);
    const shap = plan.shap!;
    assert.equal(shap.method, "treeshap");
    assert.match(shap.note, /synthetic briefs/);
    assert.equal(shap.channels.length, 12);
    for (const c of shap.channels) {
      assert.ok(c.drivers.length <= 5);
      const total = c.base + c.drivers.reduce((s, d) => s + d.value, 0) + c.other;
      assert.ok(Math.abs(total - c.prediction) < 1e-3, c.channelId);
      const score = plan.scores.find((s) => s.channelId === c.channelId)!;
      assert.equal(c.score, score.score);
      if (!score.rejected) assert.equal(score.score, Math.round(Math.max(0, Math.min(100, c.prediction))));
    }
    const baseline = await runAgent(SNACK_CHENNAI, { baseline: true });
    assert.equal(baseline.shap, undefined);
  });
});

describe("feature labels (F9)", () => {
  it("labels all 25 model features", () => {
    assert.equal(ML_FEATURE_NAMES.length, 25);
    for (const f of ML_FEATURE_NAMES) assert.ok(FEATURE_LABELS[f], f);
  });

  it("describes values in plain language", () => {
    assert.equal(describeFeature("log_budget", Math.log(3000)), "Budget ₹3,000");
    assert.equal(describeFeature("age", 21.4), "Audience age ~21");
    assert.equal(describeFeature("price_tier", 0), "Low price tier");
    assert.equal(describeFeature("vernacular", 1), "Regional-language audience");
    assert.equal(describeFeature("cat_food", 1), "A food brand");
    assert.equal(describeFeature("cat_food", 0), "Not a food brand");
    assert.equal(describeFeature("goal_b2b", 1), "Goal is B2B pipeline");
  });
});
