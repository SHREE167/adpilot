import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { CACHE_TTL, cacheClearMemory, cacheGet, cacheSet } from "@/lib/enrich/cache";

const T0 = Date.parse("2026-10-10T00:00:00Z");

describe("cache TTL (memory backend)", () => {
  beforeEach(() => cacheClearMemory());

  it("returns the value before the TTL", async () => {
    await cacheSet("k", { v: 1 }, 1000, T0);
    assert.deepEqual(await cacheGet("k", T0 + 999), { v: 1 });
  });

  it("returns null at and after the TTL", async () => {
    await cacheSet("k", { v: 1 }, 1000, T0);
    assert.equal(await cacheGet("k", T0 + 1000), null);
    assert.equal(await cacheGet("k", T0 + 5000), null);
  });

  it("returns null for a missing key", async () => {
    assert.equal(await cacheGet("nope", T0), null);
  });

  it("overwrite resets the TTL", async () => {
    await cacheSet("k", "old", 1000, T0);
    await cacheSet("k", "new", 1000, T0 + 900);
    assert.equal(await cacheGet("k", T0 + 1500), "new");
    assert.equal(await cacheGet("k", T0 + 1900), null);
  });

  it("uses brief TTLs: PageSpeed 24h, others 7d", () => {
    assert.equal(CACHE_TTL.pageSpeed, 24 * 3600 * 1000);
    assert.equal(CACHE_TTL.places, 7 * 24 * 3600 * 1000);
  });
});
