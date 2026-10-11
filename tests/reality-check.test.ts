import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SNACK_CHENNAI } from "@/lib/fixtures";
import {
  benchmarkFor,
  buildRealityCheck,
  cvrPct,
  testBudgetFor,
  verdictFor,
  type BenchmarkTable,
} from "@/lib/reality-check";
import type { PlanInput } from "@/lib/types";

const TABLE: BenchmarkTable = {
  goals: {
    sales: { low: 0.005, typical: 0.01, high: 0.03 },
    leads: { low: 0.003, typical: 0.008, high: 0.02 },
  },
};

const brief = (over: Partial<PlanInput> = {}): PlanInput => ({
  ...SNACK_CHENNAI,
  goal: "sales",
  budget: 5000,
  price: 500,
  margin: 20,
  ...over,
});

describe("reality check math (F8)", () => {
  it("profit per sale, ceil break-even units, required CVR", () => {
    // 500 × 20% = ₹100 per sale → 5000 / 100 = 50 sales; 50 / 2000 clicks = 2.5%
    const rc = buildRealityCheck({ input: brief(), clicks: 2000 }, TABLE)!;
    assert.equal(rc.profitPerSale, 100);
    assert.equal(rc.breakEvenUnits, 50);
    assert.equal(rc.requiredCvr, 0.025);
    assert.equal(rc.ratio, 2.5);
    assert.equal(rc.verdict, "likely_loss");
  });

  it("rounds break-even units up", () => {
    // 5000 / 107 = 46.7 → 47
    const rc = buildRealityCheck({ input: brief({ price: 535, margin: 20 }), clicks: 1516 }, TABLE)!;
    assert.equal(rc.breakEvenUnits, 47);
    assert.equal(rc.headline, "You need 47 sales to break even.");
    assert.equal(rc.detail, "That needs a 3.1% conversion rate; typical is ~1% (ESTIMATE).");
    assert.match(rc.advice, /Start with a ₹1,000 test or do the free actions first\./);
  });

  it("verdict boundaries: exactly typical is Healthy, exactly 2x is Tight", () => {
    // 50 sales: 5000 clicks → 1% (1x), 2500 clicks → 2% (2x), 2499 → just over 2x
    assert.equal(buildRealityCheck({ input: brief(), clicks: 5000 }, TABLE)!.verdict, "healthy");
    assert.equal(buildRealityCheck({ input: brief(), clicks: 2500 }, TABLE)!.verdict, "tight");
    assert.equal(buildRealityCheck({ input: brief(), clicks: 2499 }, TABLE)!.verdict, "likely_loss");
    assert.equal(verdictFor(1), "healthy");
    assert.equal(verdictFor(2), "tight");
    assert.equal(verdictFor(2.0001), "likely_loss");
  });

  it("healthy plans get no test budget", () => {
    const rc = buildRealityCheck({ input: brief(), clicks: 10000 }, TABLE)!;
    assert.equal(rc.verdict, "healthy");
    assert.equal(rc.testBudget, undefined);
  });

  it("zero clicks: no CVR, likely loss, honest copy", () => {
    const rc = buildRealityCheck({ input: brief(), clicks: 0 }, TABLE)!;
    assert.equal(rc.requiredCvr, null);
    assert.equal(rc.ratio, null);
    assert.equal(rc.verdict, "likely_loss");
    assert.match(rc.detail, /no clicks/);
  });

  it("skips silently without the price/margin pair", () => {
    assert.equal(buildRealityCheck({ input: { ...SNACK_CHENNAI }, clicks: 900 }, TABLE), undefined);
    assert.equal(buildRealityCheck({ input: brief({ margin: undefined }), clicks: 900 }, TABLE), undefined);
    assert.equal(buildRealityCheck({ input: brief({ price: undefined }), clicks: 900 }, TABLE), undefined);
  });

  it("unknown goals fall back to the sales band", () => {
    assert.deepEqual(benchmarkFor("Leads", TABLE), { goal: "leads", ...TABLE.goals.leads });
    assert.deepEqual(benchmarkFor("world peace", TABLE), { goal: "sales", ...TABLE.goals.sales });
  });

  it("test budget: ~20%, rounded to ₹500, at least ₹500, never above the budget", () => {
    assert.equal(testBudgetFor(5000), 1000);
    assert.equal(testBudgetFor(3000), 500);
    assert.equal(testBudgetFor(40000), 8000);
    assert.equal(testBudgetFor(500), 500);
    const tiny = buildRealityCheck({ input: brief({ budget: 500 }), clicks: 10 }, TABLE)!;
    assert.equal(tiny.testBudget, 500);
    assert.match(tiny.advice, /treat this month as a test/);
  });

  it("formats conversion percentages honestly", () => {
    assert.equal(cvrPct(0.031), "3.1%");
    assert.equal(cvrPct(0.01), "1%");
    assert.equal(cvrPct(0.0025), "0.25%");
    assert.equal(cvrPct(0.333), "33%");
  });

  it("runAgent: verdict with the pair, skipped span without, plan unchanged", async () => {
    const { runAgent } = await import("@/lib/agent");
    const withPair = await runAgent({ ...SNACK_CHENNAI, price: 20, margin: 30 });
    const rc = withPair.realityCheck!;
    assert.ok(rc);
    assert.equal(rc.clicks, withPair.totals.clicks);
    assert.equal(rc.breakEvenUnits, Math.ceil(SNACK_CHENNAI.budget / 6));
    assert.ok(withPair.trace!.spans.some((s) => s.name === "reality_check" && s.status === "ok"));

    const without = await runAgent(SNACK_CHENNAI);
    assert.equal(without.realityCheck, undefined);
    const span = without.trace!.spans.find((s) => s.name === "reality_check");
    assert.equal(span?.status, "skipped");
    assert.deepEqual(
      without.mix.map((m) => [m.channelId, m.budget]),
      withPair.mix.map((m) => [m.channelId, m.budget])
    );
  });

  it("ships an editable ESTIMATE benchmark for every goal", async () => {
    const data = (await import("@/data/benchmarks.json")).default as BenchmarkTable & {
      label: string;
    };
    assert.equal(data.label, "ESTIMATE");
    for (const g of ["awareness", "sales", "leads", "store_visits", "app_installs", "b2b"]) {
      const b = data.goals[g];
      assert.ok(b && b.low < b.typical && b.typical < b.high, g);
    }
  });
});
