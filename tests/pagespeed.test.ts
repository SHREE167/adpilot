import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { cacheClearMemory } from "@/lib/enrich/cache";
import {
  fetchPageSpeed,
  publicSiteUrl,
  toPageSpeedResult,
  type PsiResponse,
} from "@/lib/enrich/pagespeed";
import { runSource } from "@/lib/enrich/signal";
import { speedBand, speedFix } from "@/lib/speed-rules";
import type { PageSpeedResult } from "@/lib/types";

const raw = JSON.parse(
  readFileSync(path.join(process.cwd(), "fixtures", "api-raw", "pagespeed.json"), "utf8")
) as PsiResponse;

afterEach(() => {
  cacheClearMemory();
  delete process.env.ADPILOT_MOCK_APIS;
  delete process.env.PAGESPEED_API_KEY;
});

const result = (lcpMs: number, fieldLcp?: PageSpeedResult["fieldLcp"]): PageSpeedResult => ({
  url: "https://a.in/",
  strategy: "mobile",
  score: 50,
  lcpMs,
  ...(fieldLcp ? { fieldLcp } : {}),
});

describe("toPageSpeedResult", () => {
  it("parses the recorded real PSI response", () => {
    const r = toPageSpeedResult(raw, "https://adpilot-olive-nine.vercel.app/");
    assert.equal(r.strategy, "mobile");
    assert.ok(r.score >= 0 && r.score <= 100 && Number.isInteger(r.score));
    assert.ok(r.lcpMs > 0);
    assert.match(r.url, /^https:\/\/adpilot-olive-nine\.vercel\.app/);
  });

  it("reads the CrUX field bucket when present", () => {
    const r = toPageSpeedResult(
      {
        loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { category: "SLOW" } } },
        lighthouseResult: {
          categories: { performance: { score: 0.42 } },
          audits: { "largest-contentful-paint": { numericValue: 5234.6 } },
        },
      },
      "https://a.in/"
    );
    assert.deepEqual(r, { url: "https://a.in/", strategy: "mobile", score: 42, lcpMs: 5235, fieldLcp: "SLOW" });
  });

  it("throws (→ status error) when Lighthouse has no score", () => {
    assert.throws(() => toPageSpeedResult({ lighthouseResult: {} }, "https://a.in/"), /no performance score/);
  });
});

describe("speed rules", () => {
  it("LCP > 4s is the first fix; 4s or under is not", () => {
    assert.match(speedFix(result(5200)) || "", /5\.2s/);
    assert.equal(speedFix(result(4000)), null);
    assert.equal(speedBand(result(3000)), "needs_work");
    assert.equal(speedBand(result(1800)), "good");
  });

  it("real-user data overrides the lab run", () => {
    assert.equal(speedBand(result(1500, "SLOW")), "poor");
    assert.equal(speedBand(result(6000, "FAST")), "good");
    assert.equal(speedFix(undefined), null);
  });
});

describe("publicSiteUrl", () => {
  it("allows public http(s) sites only", () => {
    assert.equal(publicSiteUrl("https://shop.in/menu#x"), "https://shop.in/menu");
    for (const bad of [
      "",
      null,
      "ftp://shop.in",
      "http://localhost:3000",
      "http://127.0.0.1/",
      "http://[::1]/",
      "https://example-snack.local/",
      "https://intranet/",
      "not a url",
    ]) {
      assert.equal(publicSiteUrl(bad), null, String(bad));
    }
  });
});

describe("fetchPageSpeed", () => {
  it("skips without a key and never calls out", async () => {
    const s = await fetchPageSpeed("https://shop.in/");
    assert.equal(s.status, "skipped");
    assert.match(s.reason || "", /no API key \(PAGESPEED_API_KEY\)/);
  });

  it("skips a private or unreachable URL before anything else", async () => {
    process.env.PAGESPEED_API_KEY = "test-key";
    const s = await fetchPageSpeed("https://example-snack.local/");
    assert.equal(s.status, "skipped");
    assert.match(s.reason || "", /no public site URL/);
  });

  it("a slow PSI becomes status timeout", async () => {
    const s = await runSource(
      "pagespeed",
      (signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
      { timeoutMs: 30 }
    );
    assert.equal(s.status, "timeout");
  });

  it("mock mode reads the recorded fixture (badged mock, not live)", async () => {
    process.env.ADPILOT_MOCK_APIS = "1";
    const s = await fetchPageSpeed("https://adpilot-olive-nine.vercel.app/");
    assert.equal(s.status, "ok");
    assert.equal(s.mock, true);
    assert.equal(s.data?.strategy, "mobile");
    assert.ok((s.data?.score ?? -1) >= 0);
  });
});
