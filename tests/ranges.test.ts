import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import golden from "../eval/golden-briefs.json";
import { runAgent } from "@/lib/agent";
import { capMetaReach, forecastChannel, META_CHANNELS, rollupForecast } from "@/lib/forecast";
import { DEFAULT_RATE_CARD, getEntry } from "@/lib/rate-card";
import {
  DEFAULT_BAND_PCT,
  defaultRanges,
  isOrdered,
  rangeAround,
  rangesOf,
  rangeText,
  totalRanges,
  totalsRangesOf,
} from "@/lib/ranges";
import { buildRealityCheck } from "@/lib/reality-check";
import type { ChannelAllocation, ChannelId, PlanInput } from "@/lib/types";

const BRIEFS = (golden as { briefs: { id: string; input: PlanInput }[] }).briefs;
const SNACK = BRIEFS.find((b) => b.id === "sig-3k-student")!.input;

afterEach(() => {
  delete process.env.ADPILOT_MOCK_APIS;
});

function row(channelId: ChannelId, budget: number): ChannelAllocation {
  return {
    channelId,
    name: channelId,
    score: 60,
    budget,
    percent: 0,
    explanation: "",
    forecast: forecastChannel(budget, getEntry(DEFAULT_RATE_CARD, channelId), SNACK, "low"),
  };
}

describe("rangeAround", () => {
  it("±30% rounded outward; low <= mid <= high; never negative", () => {
    assert.deepEqual(rangeAround(1000, 0.3), { low: 700, mid: 1000, high: 1300 });
    assert.deepEqual(rangeAround(7, 0.3), { low: 4, mid: 7, high: 10 });
    assert.deepEqual(rangeAround(0, 0.3), { low: 0, mid: 0, high: 0 });
    assert.deepEqual(rangeAround(2.3, 0.3, 0.1), { low: 1.6, mid: 2.3, high: 3 });
    for (const m of [0, 1, 3, 9.9, 123.4, 1e6]) assert.ok(isOrdered(rangeAround(m, 0.3, 0.1)));
  });

  it("rangeText collapses equal ends", () => {
    assert.equal(rangeText({ low: 700, mid: 1000, high: 1300 }, String), "700–1300");
    assert.equal(rangeText({ low: 0, mid: 0, high: 0 }, String), "0");
  });
});

describe("forecast ranges", () => {
  it("every channel forecast carries a default band around its mid", () => {
    const f = forecastChannel(1500, getEntry(DEFAULT_RATE_CARD, "instagram_reels"), SNACK, "low");
    assert.equal(f.ranges?.band.kind, "default");
    assert.equal(f.ranges?.band.pct, DEFAULT_BAND_PCT);
    assert.equal(f.ranges?.clicks.mid, f.clicks);
    assert.equal(f.ranges?.reach.mid, f.reach);
    assert.equal(f.ranges?.conversions.mid, f.conversions);
  });

  it("Meta pool narrows FB/IG reach to ±15% and keeps the combined high inside the pool", () => {
    const mix = [row("instagram_reels", 20000), row("facebook", 20000), row("google_search", 5000)];
    const metaMid = mix.filter((r) => META_CHANNELS.has(r.channelId)).reduce((s, r) => s + r.forecast.reach, 0);
    const pool = Math.round(metaMid * 1.05); // barely above mid: the high must be squeezed
    const out = capMetaReach(mix, pool);
    const meta = out.filter((r) => META_CHANNELS.has(r.channelId));
    for (const r of meta) {
      assert.equal(r.forecast.ranges?.reachBand?.kind, "signal");
      assert.ok(isOrdered(r.forecast.ranges!.reach));
    }
    assert.ok(meta.reduce((s, r) => s + r.forecast.ranges!.reach.high, 0) <= pool);
    assert.equal(out[2].forecast.ranges?.reachBand, undefined, "Search keeps the default band");
  });

  it("totals sum channel lows/mids/highs; mid equals the old single number", () => {
    const mix = [row("instagram_reels", 2000), row("whatsapp", 1000)];
    const { totals } = rollupForecast(mix, SNACK, "low");
    assert.equal(totals.ranges?.clicks.mid, totals.clicks);
    assert.equal(totals.ranges?.reach.mid, totals.reach);
    assert.ok(isOrdered(totals.ranges!.clicks) && isOrdered(totals.ranges!.reach) && isOrdered(totals.ranges!.conversions));
  });

  it("old plans without ranges get a derived default band", () => {
    const f = { ...forecastChannel(1000, getEntry(DEFAULT_RATE_CARD, "youtube"), SNACK, "low") };
    delete f.ranges;
    assert.deepEqual(rangesOf(f), defaultRanges(f));
    const totals = { budget: 1, impressions: 1, clicks: f.clicks, reach: f.reach, conversions: f.conversions, estimatedCpa: null, estimatedRoas: null, estimatedAov: 1 };
    assert.deepEqual(totalsRangesOf(totals, [f]), totalRanges([f]));
  });
});

describe("reality check with a clicks range", () => {
  it("fewest clicks need the highest conversion rate; verdict still uses mid", () => {
    const input = { ...SNACK, price: 20, margin: 30 };
    const plain = buildRealityCheck({ input, clicks: 400 })!;
    const ranged = buildRealityCheck({ input, clicks: 400, clicksRange: { low: 280, mid: 400, high: 520 } })!;
    assert.equal(ranged.verdict, plain.verdict);
    assert.equal(ranged.requiredCvr, plain.requiredCvr);
    assert.ok(ranged.requiredCvrRange!.low < ranged.requiredCvr! && ranged.requiredCvr! < ranged.requiredCvrRange!.high);
    assert.equal(ranged.requiredCvrRange!.high, ranged.breakEvenUnits / 280);
  });
});

describe("plans (mock mode): low <= mid <= high everywhere", () => {
  it("every golden brief", async () => {
    process.env.ADPILOT_MOCK_APIS = "1";
    for (const b of BRIEFS) {
      const plan = await runAgent(b.input);
      for (const m of plan.mix) {
        const r = m.forecast.ranges!;
        for (const k of ["reach", "clicks", "conversions"] as const) assert.ok(isOrdered(r[k]), `${b.id} ${m.channelId} ${k}`);
      }
      const t = plan.totals.ranges!;
      for (const k of ["reach", "clicks", "conversions"] as const) assert.ok(isOrdered(t[k]), `${b.id} total ${k}`);
      if (plan.realityCheck?.requiredCvrRange) {
        const rc = plan.realityCheck;
        assert.ok(rc.requiredCvrRange!.low <= rc.requiredCvr! && rc.requiredCvr! <= rc.requiredCvrRange!.high);
      }
    }
  });
});
