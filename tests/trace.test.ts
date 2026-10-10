import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAgent } from "@/lib/agent";
import { SNACK_CHENNAI } from "@/lib/fixtures";
import { createTrace } from "@/lib/trace";

describe("trace", () => {
  it("records ok, error (rethrown), skipped and signal spans", async () => {
    let t = 1000;
    const trace = createTrace(() => t);
    const v = await trace.span("a", () => {
      t += 5;
      return 2;
    }, { meta: (r) => ({ r }) });
    assert.equal(v, 2);
    await assert.rejects(trace.span("b", () => Promise.reject(new Error("nope"))), /nope/);
    trace.skip("c", "time budget");
    t += 10;
    trace.signal("d", {
      source: "x",
      status: "timeout",
      fetchedAt: "",
      ms: 4,
      cached: false,
      reason: "slow",
    }, "enrich");
    const out = trace.finish();
    assert.equal(out.totalMs, 15);
    const byName = Object.fromEntries(out.spans.map((s) => [s.name, s]));
    assert.equal(byName.a.status, "ok");
    assert.equal(byName.a.ms, 5);
    assert.deepEqual(byName.a.meta, { r: 2 });
    assert.equal(byName.b.status, "error");
    assert.equal(byName.c.status, "skipped");
    assert.equal(byName.d.status, "timeout");
    assert.equal(byName.d.parent, "enrich");
    assert.equal(byName.d.startMs, 11);
  });
});

describe("runAgent (zero keys)", () => {
  it("returns a v2 plan with a complete trace and a mix that sums to budget", async () => {
    const plan = await runAgent(SNACK_CHENNAI);
    assert.equal(plan.planVersion, 2);
    assert.ok(plan.enrichment);
    assert.ok(plan.trace);
    assert.equal(plan.agentMs, plan.trace.totalMs);
    const names = plan.trace.spans.map((s) => s.name);
    for (const step of ["scrape", "recognize", "enrich", "score", "allocate", "forecast", "copy_template", "placements"]) {
      assert.ok(names.includes(step), `missing span ${step}`);
    }
    assert.equal(plan.llmUsed, false);
    assert.equal(plan.mix.reduce((s, r) => s + r.budget, 0), SNACK_CHENNAI.budget);
  });
});
