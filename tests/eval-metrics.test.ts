import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ablationAdditive,
  groundedFacts,
  jaccardDistance,
  meanPairwiseJaccard,
  percentile,
} from "@/eval/metrics";
import { runAgent } from "@/lib/agent";
import { SNACK_CHENNAI } from "@/lib/fixtures";
import type { LocalMarket, PlanResult, Signal } from "@/lib/types";

describe("eval metrics (F16)", () => {
  it("Jaccard distance", () => {
    assert.equal(jaccardDistance(["a", "b"], ["a", "b"]), 0);
    assert.equal(jaccardDistance(["a"], ["b"]), 1);
    assert.equal(jaccardDistance(["a", "b", "c"], ["b", "c", "d"]), 0.5);
    assert.equal(jaccardDistance([], []), 0);
  });

  it("mean pairwise Jaccard", () => {
    assert.equal(meanPairwiseJaccard([["a"], ["a"], ["a"]]), 0);
    // pairs: (a,b)=1, (a,ab)=0.5, (b,ab)=0.5
    assert.equal(meanPairwiseJaccard([["a"], ["b"], ["a", "b"]]), 2 / 3);
  });

  it("percentile interpolates", () => {
    assert.equal(percentile([1, 2, 3, 4, 5], 50), 3);
    assert.equal(percentile([10, 20], 50), 15);
    assert.equal(percentile([5, 1, 3], 0), 1);
    assert.equal(percentile([5, 1, 3], 100), 5);
    assert.equal(percentile([], 95), 0);
  });

  it("ablation additivity: linear models add up, interactions do not", () => {
    assert.equal(ablationAdditive((x) => 2 * x[0] + 3 * x[1] + 1, [1, 2]), true);
    assert.equal(ablationAdditive((x) => x[0] * x[1], [1, 2]), false);
  });

  it("Places facts count only for the brief's own city", () => {
    const market: Signal<LocalMarket> = {
      source: "google_places",
      status: "ok",
      fetchedAt: "2026-10-10T10:00:00.000Z",
      ms: 1,
      cached: false,
      mock: true,
      data: {
        query: "snack shop in Chennai",
        keyword: "snack shop",
        count: 20,
        more: true,
        avgRating: 4.5,
        ratedCount: 20,
        top: [{ name: "A", rating: 4.9, reviews: 40 }],
        own: { query: "x", found: false },
      },
    };
    const plan = (city: string) =>
      ({
        input: { ...SNACK_CHENNAI, city },
        weeklyForecast: [],
        mix: [],
        enrichment: { localMarket: market },
      }) as unknown as PlanResult;
    assert.equal(groundedFacts(plan("Chennai")).length, 4);
    assert.equal(groundedFacts(plan("Delhi")).length, 0);
  });

  it("baseline (v1) path: no enrichment or v2 layers, mix still sums", async () => {
    const plan = await runAgent({ ...SNACK_CHENNAI, price: 20, margin: 30 }, { baseline: true });
    assert.equal(plan.enrichment, undefined);
    assert.equal(plan.zeroRupee, undefined);
    assert.equal(plan.realityCheck, undefined);
    assert.equal(groundedFacts(plan).length, 0);
    assert.equal(plan.mix.reduce((s, m) => s + m.budget, 0), SNACK_CHENNAI.budget);
    for (const name of ["enrich", "zero_rupee", "reality_check"]) {
      assert.equal(plan.trace!.spans.find((s) => s.name === name)?.status, "skipped", name);
    }
  });
});
