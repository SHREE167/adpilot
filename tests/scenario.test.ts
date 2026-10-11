import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import golden from "../eval/golden-briefs.json";
import { runAgent } from "@/lib/agent";
import { linkedinAllowed, applyPolicy, LINKEDIN_MIN_BUDGET } from "@/lib/policy";
import { DEFAULT_RATE_CARD } from "@/lib/rate-card";
import { isOrdered } from "@/lib/ranges";
import { gridBudgets, nearestPoint, scenarioAt, sliderSteps, transitions } from "@/lib/scenario";
import type { BudgetGrid, ChannelId, PlanInput, PlanResult } from "@/lib/types";

const BRIEFS = (golden as { briefs: { id: string; input: PlanInput }[] }).briefs;
const byId = (id: string) => BRIEFS.find((b) => b.id === id)!.input;

afterEach(() => {
  delete process.env.ADPILOT_MOCK_APIS;
});

async function mockPlan(id: string): Promise<PlanResult> {
  process.env.ADPILOT_MOCK_APIS = "1";
  return runAgent(byId(id));
}

const sum = (p: { mix: { budget: number }[] }) => p.mix.reduce((s, m) => s + m.budget, 0);

describe("grid + steps", () => {
  it("11 log-spaced budgets from 0.25x to 4x; the middle one is exactly the plan budget", () => {
    const g = gridBudgets(3000);
    assert.equal(g.length, 11);
    assert.equal(g[5].budget, 3000);
    assert.equal(g[5].factor, 1);
    assert.equal(g[0].budget, 750);
    assert.equal(g[10].budget, 12000);
    for (let i = 1; i < g.length; i++) assert.ok(g[i].budget > g[i - 1].budget);
  });

  it("slider steps are sorted, rounded, span the grid and include the plan budget", async () => {
    const plan = await mockPlan("sig-3k-student");
    const steps = sliderSteps(plan.budgetGrid!);
    assert.ok(steps.includes(3000));
    assert.ok(steps[0] >= 700 && steps[0] <= 800, `first step ${steps[0]} near 0.25x`);
    assert.ok(steps[steps.length - 1] >= 11900 && steps[steps.length - 1] <= 12100, "last step near 4x");
    assert.deepEqual([...steps].sort((a, b) => a - b), steps);
    assert.equal(new Set(steps).size, steps.length);
    assert.ok(steps.length >= 40);
  });
});

describe("budget policy (shared server/client)", () => {
  const notB2B = { b2b: false, professional: false, goal: "sales" };
  it("LinkedIn below ₹15k only for a B2B goal with a professional audience", () => {
    assert.equal(linkedinAllowed(LINKEDIN_MIN_BUDGET - 1, notB2B), false);
    assert.equal(linkedinAllowed(LINKEDIN_MIN_BUDGET, notB2B), true);
    assert.equal(linkedinAllowed(5000, { b2b: true, professional: true, goal: "b2b" }), true);
    assert.deepEqual(applyPolicy("linkedin", 90, 5000, notB2B).rejected, true);
    assert.equal(applyPolicy("youtube", 39, 5000, notB2B).rejected, true);
    assert.equal(applyPolicy("youtube", 40, 5000, notB2B).rejected, false);
  });
});

describe("budget grid on a real plan", () => {
  it("raw scores for all 12 channels; SHAP only for that point's mix", async () => {
    const plan = await mockPlan("sig-3k-student");
    const g = plan.budgetGrid!;
    assert.equal(g.points.length, 11);
    assert.equal(g.base, 3000);
    for (const p of g.points) {
      assert.equal(Object.keys(p.scores).length, 12);
      assert.ok(p.shap.length >= 1 && p.shap.length <= 5);
    }
    const at1 = nearestPoint(g, 3000);
    assert.deepEqual(at1.shap.map((s) => s.channelId).sort(), plan.mix.map((m) => m.channelId).sort());
    assert.equal(g.rateCard.channels.length, 12);
    assert.ok(!JSON.stringify(g).includes("\"tree\""), "no model trees in the plan");
  });

  it("scenario at 1x reproduces the saved plan exactly", async () => {
    const plan = await mockPlan("sig-3k-student");
    const s = scenarioAt(plan, plan.budgetGrid!.base);
    assert.deepEqual(
      s.mix.map((m) => [m.channelId, m.budget, m.forecast]),
      plan.mix.map((m) => [m.channelId, m.budget, m.forecast])
    );
    assert.deepEqual(s.totals, plan.totals);
    assert.deepEqual(s.weeklyForecast, plan.weeklyForecast);
    assert.deepEqual(s.realityCheck, plan.realityCheck);
  });

  it("totals equal the slider budget at every step; ranges stay ordered", async () => {
    for (const id of ["sig-3k-student", "sig-40k-b2b", "chn-tailor", "del-mithai"]) {
      const plan = await mockPlan(id);
      for (const b of sliderSteps(plan.budgetGrid!)) {
        const s = scenarioAt(plan, b);
        assert.equal(sum(s), b, `${id} @ ${b}`);
        assert.equal(s.totals.budget, b);
        assert.ok(s.mix.length >= 1 && s.mix.length <= 5);
        for (const k of ["reach", "clicks", "conversions"] as const) assert.ok(isOrdered(s.totals.ranges![k]));
        assert.ok(s.mix.every((m) => m.explanation), "every row has an explanation");
      }
    }
  });

  it("reality verdict re-runs at the slider budget", async () => {
    const plan = await mockPlan("sig-3k-student");
    const hi = scenarioAt(plan, 12000);
    assert.equal(hi.realityCheck!.budget, 12000);
    assert.ok(hi.realityCheck!.breakEvenUnits > plan.realityCheck!.breakEvenUnits);
  });

  it("scenario compute is far below 50 ms", async () => {
    const plan = await mockPlan("sig-40k-b2b");
    const steps = sliderSteps(plan.budgetGrid!);
    const t0 = performance.now();
    for (const b of steps) scenarioAt(plan, b);
    assert.ok((performance.now() - t0) / steps.length < 5);
  });
});

describe("transitions", () => {
  it("LinkedIn blocked by policy below ₹15,000 appears just above it", () => {
    const base = 10000;
    const score = (id: ChannelId) => (id === "linkedin" ? 95 : id === "google_search" ? 80 : id === "whatsapp" ? 70 : 10);
    const grid: BudgetGrid = {
      version: 1,
      base,
      points: gridBudgets(base).map(({ budget, factor }) => ({
        budget,
        factor,
        scores: Object.fromEntries(DEFAULT_RATE_CARD.channels.map((c) => [c.id, score(c.id)])) as Record<ChannelId, number>,
        shap: [],
      })),
      rateCard: { version: DEFAULT_RATE_CARD.version, channels: DEFAULT_RATE_CARD.channels },
      policy: { b2b: false, professional: false, goal: "sales" },
    };
    const plan = {
      input: { ...byId("chn-tailor"), budget: base },
      category: "local_service",
      priceTier: "low",
      product: { recognizedName: "Test", differentiators: [] },
      mix: [],
      budgetGrid: grid,
    } as unknown as PlanResult;
    const steps = sliderSteps(grid);
    const t = transitions(plan, steps).find((x) => x.channelId === "linkedin")!;
    assert.equal(t.kind, "enters");
    assert.equal(t.direction, "above");
    assert.ok(t.budget < LINKEDIN_MIN_BUDGET);
    assert.ok(steps[steps.indexOf(t.budget) + 1] >= LINKEDIN_MIN_BUDGET);
    assert.ok(scenarioAt(plan, steps[steps.indexOf(t.budget) + 1]).mix.some((m) => m.channelId === "linkedin"));
  });
});
