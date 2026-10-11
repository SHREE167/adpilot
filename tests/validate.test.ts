import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SNACK_CHENNAI } from "@/lib/fixtures";
import { parsePlanInput, parseRealityInputs } from "@/lib/validate";

describe("price / margin validation (F8)", () => {
  it("both blank or one missing: skipped silently", () => {
    assert.deepEqual(parseRealityInputs(undefined, undefined), {});
    assert.deepEqual(parseRealityInputs("", "  "), {});
    assert.deepEqual(parseRealityInputs("199", ""), {});
    assert.deepEqual(parseRealityInputs(null, 30), {});
  });

  it("valid pair passes as numbers", () => {
    assert.deepEqual(parseRealityInputs("199", "30"), { price: 199, margin: 30 });
    assert.deepEqual(parseRealityInputs(20, 1), { price: 20, margin: 1 });
    assert.deepEqual(parseRealityInputs(20, 95), { price: 20, margin: 95 });
  });

  it("rejects price <= 0 and margin outside 1-95", () => {
    assert.throws(() => parseRealityInputs(0, 30), /price/);
    assert.throws(() => parseRealityInputs(-5, 30), /price/);
    assert.throws(() => parseRealityInputs("abc", 30), /price/);
    assert.throws(() => parseRealityInputs(100, 0.5), /margin/);
    assert.throws(() => parseRealityInputs(100, 96), /margin/);
  });

  it("parsePlanInput keeps the pair and old briefs unchanged", () => {
    const withPair = parsePlanInput({ ...SNACK_CHENNAI, price: "20", margin: "30" });
    assert.equal(withPair.price, 20);
    assert.equal(withPair.margin, 30);
    const old = parsePlanInput(SNACK_CHENNAI);
    assert.equal("price" in old, false);
    assert.equal("margin" in old, false);
  });
});
