import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import golden from "../eval/golden-briefs.json";
import { runAgent } from "@/lib/agent";
import { cacheClearMemory } from "@/lib/enrich/cache";
import { extractNumbers, groundingRate, groundingSet, guardText } from "@/lib/grounding-guard";
import {
  applyKitTexts,
  buildLaunchKit,
  dayRange,
  guardKitTexts,
  hour12,
  kitEvidence,
  kitTexts,
} from "@/lib/launch-kit";
import type { PlanInput, PlanResult } from "@/lib/types";

const BRIEFS = (golden as { briefs: { id: string; input: PlanInput }[] }).briefs;
const byId = (id: string) => BRIEFS.find((b) => b.id === id)!.input;

afterEach(() => {
  cacheClearMemory();
  delete process.env.ADPILOT_MOCK_APIS;
});

async function mockPlan(id: string): Promise<PlanResult> {
  process.env.ADPILOT_MOCK_APIS = "1";
  return runAgent(byId(id));
}

function evidenceOf(plan: PlanResult): number[] {
  const { input, mix, totals, weeklyForecast, realityCheck, enrichment, zeroRupee, placements } = plan;
  return groundingSet(
    { input, mix, totals, weeklyForecast, realityCheck, enrichment, zeroRupee, placements },
    kitEvidence(plan.launchKit!)
  );
}

function allKitText(plan: PlanResult): string[] {
  return Object.values(kitTexts(plan.launchKit!));
}

describe("helpers", () => {
  it("dayRange + hour12", () => {
    assert.equal(dayRange(["Fri", "Sat", "Sun"]), "Fri-Sun");
    assert.equal(dayRange(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]), "every day");
    assert.equal(dayRange(["Tue", "Thu"]), "Tue, Thu");
    assert.deepEqual([hour12(9), hour12(12), hour12(18), hour12(0)], ["9am", "12pm", "6pm", "12am"]);
  });
});

describe("buildLaunchKit (deterministic)", () => {
  it("one entry per mix channel, budgets match the mix", async () => {
    const plan = await mockPlan("sig-3k-student");
    const kit = plan.launchKit!;
    assert.equal(kit.wording !== undefined, true);
    assert.deepEqual(kit.channels.map((c) => c.channelId), plan.mix.map((m) => m.channelId));
    assert.deepEqual(kit.channels.map((c) => c.budget), plan.mix.map((m) => m.budget));
    for (const c of kit.channels) {
      assert.ok(c.creatives.count >= 1);
      assert.ok(c.checklist.length >= 1 && c.checklist.length <= 5);
      assert.ok(c.metric.name);
      assert.ok(c.schedule.startHour < c.schedule.endHour);
    }
  });

  it("uses signals: Meta spec on FB/IG, creators, festival timing, pixel check", async () => {
    const plan = await mockPlan("sig-3k-student");
    const reels = plan.launchKit!.channels.find((c) => c.channelId === "instagram_reels")!;
    assert.ok(reels.targeting.spec, "Meta targeting spec attached");
    assert.ok(reels.sources.includes("meta_reach"));
    assert.ok(reels.checklist.some((t) => /Chennai Food/.test(t)), "creator DM from YouTube signal");
    assert.ok(reels.checklist.some((t) => /Pixel/.test(t)), "pixel check from site readiness");
  });

  it("deterministic template text is 100% grounded in plan + signals", async () => {
    for (const id of ["sig-3k-student", "sig-40k-b2b", "del-ac-repair", "cbe-salon"]) {
      const plan = await mockPlan(id);
      const r = groundingRate(allKitText(plan), evidenceOf(plan));
      assert.equal(r.rate, 1, `${id}: ${r.grounded}/${r.total}`);
    }
  });

  it("two businesses in the same city get visibly different kits", async () => {
    const a = await mockPlan("chn-biryani");
    const b = await mockPlan("chn-neet");
    assert.notDeepEqual(allKitText(a), allKitText(b));
    assert.notEqual(a.launchKit!.channels[0].schedule.text, b.launchKit!.channels[0].schedule.text);
  });

  it("without signals (zero keys, no mock) the kit still builds, with no signal sources", () => {
    const kit = buildLaunchKit({
      input: byId("del-ac-repair"),
      category: "local_service",
      mix: [],
      placements: [],
    });
    assert.deepEqual(kit.channels, []);
    assert.equal(kit.wording, "template");
  });
});

describe("guardKitTexts (LLM rewrite)", () => {
  it("keeps grounded rewrites, reverts lines with invented numbers and reports them", async () => {
    const plan = await mockPlan("sig-3k-student");
    const kit = plan.launchKit!;
    const ev = evidenceOf(plan);
    const first = kit.channels[0];
    const reworded = {
      [`${first.channelId}.schedule`]: "தினமும் வேலை நேரம்", // no numbers: kept
      [`${first.channelId}.metric`]: "Expect 41.5% more chats and 4.75x ROAS in 937 days", // invented: reverted
      "unknown.key": "ignored 999",
    };
    const r = guardKitTexts(kit, reworded, ev, guardText);
    const out = r.kit.channels[0];
    assert.equal(out.schedule.text, "தினமும் வேலை நேரம்");
    assert.equal(out.metric.why, first.metric.why);
    assert.deepEqual(r.removed, ["41.5%", "4.75x", "937"]);
    assert.equal(groundingRate(Object.values(kitTexts(r.kit)), ev).rate, 1);
  });

  it("applyKitTexts ignores empty and non-string values", async () => {
    const plan = await mockPlan("sig-3k-student");
    const kit = plan.launchKit!;
    const key = `${kit.channels[0].channelId}.headline`;
    const out = applyKitTexts(kit, { [key]: "  " });
    assert.equal(out.channels[0].headline, kit.channels[0].headline);
  });
});

describe("runAgent + guard", () => {
  it("mock mode replays the recorded Gemini rewrite for the demo brief, through the guard", async () => {
    const plan = await mockPlan("sig-3k-student");
    assert.match(plan.launchKit!.wording, /google/);
    const span = plan.trace!.spans.find((s) => s.name === "grounding_guard")!;
    assert.equal(span.status, "ok");
    assert.ok(Number(span.meta?.checked) > 0);
    assert.equal(groundingRate(allKitText(plan), evidenceOf(plan)).rate, 1);
  });

  it("baseline (v1) has no kit and skips the guard", async () => {
    const plan = await runAgent(byId("sig-3k-student"), { baseline: true });
    assert.equal(plan.launchKit, undefined);
    assert.ok(plan.trace!.spans.some((s) => s.name === "grounding_guard" && s.status === "skipped"));
  });

  it("zero keys: template kit, nothing removed", async () => {
    const plan = await runAgent(byId("chn-tailor"));
    assert.equal(plan.launchKit!.wording, "template");
    assert.equal(plan.launchKit!.guard.removed, 0);
    assert.ok(extractNumbers(plan.launchKit!.channels[0].headline).length > 0);
  });
});
