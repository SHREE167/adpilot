import assert from "node:assert/strict";
import { describe, it } from "node:test";
import golden from "../eval/golden-briefs.json";
import { inferCategoryAndTier, scoreCategories } from "@/lib/infer";
import { mergeIntel, recognizeHeuristic } from "@/lib/recognize";
import type { PlanInput, SiteSnapshot } from "@/lib/types";

const NO_SITE: SiteSnapshot = {
  domain: "",
  url: "",
  title: null,
  description: null,
  h1: null,
  scraped: false,
};

const BRIEFS = (golden as { briefs: { id: string; expectedCategory: string; input: PlanInput }[] }).briefs;
const byId = (id: string) => BRIEFS.find((b) => b.id === id)!.input;

describe("category = what is sold, not who buys it", () => {
  for (const b of BRIEFS) {
    it(`${b.id} → ${b.expectedCategory}`, () => {
      assert.equal(inferCategoryAndTier(b.input, NO_SITE).category, b.expectedCategory);
    });
  }

  it("eval regressions: thrift + streetwear are fashion despite 'college students'", () => {
    assert.equal(inferCategoryAndTier(byId("blr-thrift-app"), NO_SITE).category, "fashion");
    assert.equal(inferCategoryAndTier(byId("mum-streetwear"), NO_SITE).category, "fashion");
  });

  it("eval regression: a sweet shop is food, not ecommerce", () => {
    assert.equal(inferCategoryAndTier(byId("del-mithai"), NO_SITE).category, "food");
  });

  it("audience words alone never decide the category", () => {
    const input: PlanInput = {
      ...byId("mum-streetwear"),
      product_name: "Hoodie Hub",
      audience_notes: "College students, university hostels, parents and job seekers",
    };
    assert.notEqual(inferCategoryAndTier(input, NO_SITE).category, "education");
  });

  it("the part after ' for ' is the buyer: 'analytics SaaS for D2C brands' is saas", () => {
    assert.equal(inferCategoryAndTier(byId("mum-analytics"), NO_SITE).category, "saas");
    const top = scoreCategories(byId("mum-analytics"), NO_SITE);
    assert.equal(top[0].category, "saas");
  });

  it("schema.org type on the page is a product-level signal", () => {
    const site: SiteSnapshot = { ...NO_SITE, scraped: true, jsonLdType: "BeautySalon", h1: "Glow" };
    const input: PlanInput = { ...byId("cbe-salon"), product_name: "Glow" };
    assert.equal(inferCategoryAndTier(input, site).category, "local_service");
  });

  it("no match falls back as before (store visit → local_service, else general)", () => {
    const base: PlanInput = { ...byId("mum-vada-pav"), product_name: "Raju & Sons", audience_notes: "" };
    assert.equal(inferCategoryAndTier({ ...base, goal: "store_visits" }, NO_SITE).category, "local_service");
    assert.equal(inferCategoryAndTier({ ...base, goal: "awareness" }, NO_SITE).category, "general");
  });
});

describe("mergeIntel (LLM refine)", () => {
  const base = recognizeHeuristic(byId("mum-streetwear"), NO_SITE);

  it("accepts a known category from the LLM", () => {
    assert.equal(mergeIntel(base, { category: "ecommerce" }).category, "ecommerce");
  });

  it("ignores a category outside the model's list", () => {
    assert.equal(mergeIntel(base, { category: "apparel & lifestyle" }).category, "fashion");
  });
});
