import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { cacheClearMemory } from "@/lib/enrich/cache";
import { runEnrichment, runSource, skipped, withTimeout } from "@/lib/enrich/signal";
import type { Signal } from "@/lib/types";

function sleep(ms: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => resolve("late"), ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new Error("aborted"));
    });
  });
}

afterEach(() => {
  cacheClearMemory();
  delete process.env.ADPILOT_MOCK_APIS;
  delete process.env.ADPILOT_FIXTURE_DIR;
});

describe("withTimeout", () => {
  it("returns the value when fn is fast", async () => {
    const r = await withTimeout(async () => 42, 200);
    assert.deepEqual(r, { ok: true, value: 42 });
  });

  it("times out and aborts the signal", async () => {
    let aborted = false;
    const t0 = Date.now();
    const r = await withTimeout((signal) => {
      signal.addEventListener("abort", () => (aborted = true));
      return sleep(5000, signal);
    }, 50);
    assert.equal(r.ok, false);
    assert.equal(aborted, true);
    assert.ok(Date.now() - t0 < 1000, "resolved near the limit, not after fn");
  });
});

describe("runSource", () => {
  it("maps a slow fetch to status timeout (never throws)", async () => {
    const s = await runSource("slow_api", (signal) => sleep(5000, signal), { timeoutMs: 40 });
    assert.equal(s.status, "timeout");
    assert.equal(s.data, undefined);
    assert.match(s.reason || "", /no response/);
  });

  it("maps a thrown error to status error", async () => {
    const s = await runSource("bad_api", async () => {
      throw new Error("HTTP 403");
    });
    assert.equal(s.status, "error");
    assert.equal(s.reason, "HTTP 403");
  });

  it("skips when a required key is missing", async () => {
    delete process.env.ADPILOT_TEST_MISSING_KEY;
    let called = false;
    const s = await runSource(
      "keyed_api",
      async () => {
        called = true;
        return 1;
      },
      { requiresEnv: ["ADPILOT_TEST_MISSING_KEY"] }
    );
    assert.equal(s.status, "skipped");
    assert.equal(called, false);
    assert.match(s.reason || "", /no API key/);
  });

  it("serves a cache hit with the original fetchedAt", async () => {
    let calls = 0;
    const fetcher = async () => ++calls;
    const first = await runSource("cached_api", fetcher, { cacheKey: "cached_api:x" });
    await sleep(15);
    const second = await runSource("cached_api", fetcher, { cacheKey: "cached_api:x" });
    assert.equal(calls, 1);
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(second.data, 1);
    assert.equal(second.fetchedAt, first.fetchedAt);
  });

  it("reads fixtures/api/<source>/<key>.json in mock mode", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adpilot-fx-"));
    mkdirSync(path.join(dir, "demo_api"));
    writeFileSync(
      path.join(dir, "demo_api", "default.json"),
      JSON.stringify({ fetchedAt: "2026-10-04T00:00:00.000Z", data: { n: 7 } })
    );
    process.env.ADPILOT_MOCK_APIS = "1";
    process.env.ADPILOT_FIXTURE_DIR = dir;
    const s = await runSource<{ n: number }>(
      "demo_api",
      async () => {
        throw new Error("live call in mock mode");
      },
      { mockKey: "missing-key", requiresEnv: ["NOT_SET_ANYWHERE"] }
    );
    assert.equal(s.status, "ok");
    assert.equal(s.mock, true);
    assert.deepEqual(s.data, { n: 7 });
    assert.equal(s.fetchedAt, "2026-10-04T00:00:00.000Z");
  });
});

describe("runEnrichment", () => {
  it("survives one task rejecting", async () => {
    const seen: string[] = [];
    const out = await runEnrichment<{ a: Signal<number>; b: Signal<number>; c: Signal<number> }>(
      {
        a: async () => ({ ...skipped<number>("a", "x"), status: "ok", data: 1 }),
        b: () => {
          throw new Error("boom");
        },
        c: () => runSource("c", (signal) => sleep(5000, signal).then(() => 3), { timeoutMs: 30 }),
      },
      (key) => seen.push(key)
    );
    assert.equal(out.a.status, "ok");
    assert.equal(out.b.status, "error");
    assert.equal(out.b.reason, "boom");
    assert.equal(out.c.status, "timeout");
    assert.deepEqual(seen.sort(), ["a", "b", "c"]);
  });
});
