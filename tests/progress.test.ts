import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { POST } from "@/app/api/plan/route";
import { SNACK_CHENNAI } from "@/lib/fixtures";
import {
  applyStepEvent,
  closeSteps,
  initialSteps,
  PIPELINE_STEPS,
  readPlanStream,
} from "@/lib/plan-progress";
import { createTrace } from "@/lib/trace";
import type { PlanStreamEvent, TraceEvent } from "@/lib/types";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

describe("trace events", () => {
  it("emits running then settled for spans, skips and signals", async () => {
    const events: TraceEvent[] = [];
    let t = 0;
    const trace = createTrace(() => t, (e) => events.push(e));
    await trace.span("scrape", () => {
      t += 40;
      return 1;
    });
    trace.skip("copy_llm", "time budget");
    trace.signal(
      "localMarket",
      { source: "google_places", status: "skipped", fetchedAt: "", ms: 0, cached: false, reason: "no API key" },
      "enrich"
    );
    await assert.rejects(trace.span("score", () => Promise.reject(new Error("boom"))));
    assert.deepEqual(
      events.map((e) => [e.name, e.status]),
      [
        ["scrape", "running"],
        ["scrape", "ok"],
        ["copy_llm", "skipped"],
        ["localMarket", "skipped"],
        ["score", "running"],
        ["score", "error"],
      ]
    );
    assert.equal(events[1].ms, 40);
    assert.equal(events[3].parent, "enrich");
    assert.equal(events[3].reason, "no API key");
    assert.equal(events[5].reason, "boom");
  });

  it("a throwing listener never breaks the run", async () => {
    const trace = createTrace(Date.now, () => {
      throw new Error("ui bug");
    });
    assert.equal(await trace.span("x", () => 7), 7);
    assert.equal(trace.finish().spans.length, 1);
  });
});

describe("progress reducer", () => {
  it("pending → running → done with server ms; enrich children run together", () => {
    let rows = initialSteps();
    assert.ok(rows.every((r) => r.status === "pending"));
    rows = applyStepEvent(rows, { name: "enrich", status: "running", atMs: 100 });
    const kids = rows.filter((r) => r.parent === "enrich");
    assert.equal(kids.length, 3);
    assert.ok(kids.every((r) => r.status === "running" && r.startAtMs === 100));
    rows = applyStepEvent(rows, { name: "localMarket", parent: "enrich", status: "skipped", atMs: 101, ms: 1, reason: "no API key" });
    const lm = rows.find((r) => r.name === "localMarket")!;
    assert.equal(lm.status, "skipped");
    assert.equal(lm.reason, "no API key");
    rows = applyStepEvent(rows, { name: "enrich", status: "ok", atMs: 140, ms: 40 });
    assert.equal(rows.find((r) => r.name === "enrich")!.ms, 40);
  });

  it("unknown server steps are shown, not dropped", () => {
    const rows = applyStepEvent(initialSteps(), { name: "audience", parent: "enrich", status: "ok", atMs: 5, ms: 3 });
    assert.equal(rows.length, PIPELINE_STEPS.length + 1);
    const i = rows.findIndex((r) => r.name === "audience");
    assert.equal(rows[i - 1].parent, "enrich", "inserted with its siblings");
  });

  it("a failed run marks in-flight steps stopped and leaves unreached ones pending", () => {
    let rows = applyStepEvent(initialSteps(), { name: "score", status: "running", atMs: 9 });
    rows = closeSteps(rows, true);
    assert.equal(rows.find((r) => r.name === "score")!.status, "error");
    assert.equal(rows.find((r) => r.name === "placements")!.status, "pending");
  });
});

describe("readPlanStream", () => {
  it("joins lines split across chunks and skips junk", async () => {
    const seen: PlanStreamEvent[] = [];
    const n = await readPlanStream(
      streamOf(['{"type":"step","name":"scr', 'ape","status":"running","atMs":0}\nnot json\n', '{"type":"error","message":"x"}']),
      (e) => seen.push(e)
    );
    assert.equal(n, 2);
    assert.equal(seen[0].type, "step");
    assert.equal(seen[1].type, "error");
  });
});

describe("POST /api/plan (zero keys)", () => {
  it("streams real step events, then the saved plan", async () => {
    const res = await POST(
      new Request("http://local/api/plan", { method: "POST", body: JSON.stringify(SNACK_CHENNAI) })
    );
    assert.match(res.headers.get("content-type") || "", /ndjson/);
    const events: PlanStreamEvent[] = [];
    await readPlanStream(res.body!, (e) => events.push(e));
    const last = events[events.length - 1];
    assert.equal(last.type, "done");
    const steps = events.filter((e): e is Extract<PlanStreamEvent, { type: "step" }> => e.type === "step");
    for (const name of ["scrape", "enrich", "localMarket", "score", "allocate", "forecast", "copy_template"]) {
      assert.ok(steps.some((s) => s.name === name && s.status !== "running"), `settled ${name}`);
    }
    assert.ok(steps.findIndex((s) => s.name === "scrape") < steps.findIndex((s) => s.name === "allocate"));
    if (last.type === "done") assert.equal(last.plan.mix.reduce((s, r) => s + r.budget, 0), SNACK_CHENNAI.budget);
  });

  it("an invalid brief streams a readable error, not a crash", async () => {
    const res = await POST(new Request("http://local/api/plan", { method: "POST", body: JSON.stringify({ budget: -1 }) }));
    const events: PlanStreamEvent[] = [];
    await readPlanStream(res.body!, (e) => events.push(e));
    assert.equal(events.at(-1)?.type, "error");
  });

  it("non-JSON body → 400 with a message", async () => {
    const res = await POST(new Request("http://local/api/plan", { method: "POST", body: "{" }));
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { message: string }).message, /not valid JSON/);
  });
});
