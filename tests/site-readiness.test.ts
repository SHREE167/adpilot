import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { buildReadiness, readinessFromTracking } from "@/lib/enrich/site-readiness";
import { SNACK_CHENNAI } from "@/lib/fixtures";
import { detectTracking, scrapeSite } from "@/lib/scrape";
import type { PlanInput } from "@/lib/types";

const BIG: PlanInput = { ...SNACK_CHENNAI, budget: 20000 };

const head = '<meta name="viewport" content="width=device-width">';

afterEach(() => {
  delete process.env.ADPILOT_MOCK_APIS;
});

describe("detectTracking", () => {
  it("finds pixel, GA4, GTM, WhatsApp, tel and CTA", () => {
    const html = `<html><head>${head}<meta property="og:image" content="/a.jpg">
      <script src="https://connect.facebook.net/en_US/fbevents.js"></script>
      <script>fbq('init','1');gtag('config','G-ABC1234XYZ');</script>
      <script>dataLayer.push({});/* GTM-AB12CD */</script></head>
      <body><a href="https://wa.me/919800000000">Chat</a><a href="tel:+919800000000">x</a>
      <button>Order now</button></body></html>`;
    const t = detectTracking(html, "https://shop.in/");
    assert.deepEqual(t, {
      https: true,
      viewport: true,
      metaPixel: true,
      ga4: true,
      gtmIds: ["GTM-AB12CD"],
      whatsapp: true,
      tel: true,
      cta: true,
      ogImage: true,
    });
  });

  it("flags plain http and a bare page", () => {
    const t = detectTracking("<html><body><p>Hello</p></body></html>", "http://shop.in/");
    assert.equal(t.https, false);
    assert.equal(t.metaPixel, false);
    assert.equal(t.cta, false);
    assert.deepEqual(t.gtmIds, []);
  });
});

describe("readiness rules", () => {
  it("GTM-only page: pixel is 'may be inside it' (warn), never a fail", () => {
    const t = detectTracking(`<html><head>${head}</head><script>GTM-K7Q2ZP4</script></html>`, "https://a.in");
    const r = readinessFromTracking(t, BIG);
    const pixel = r.checks.find((c) => c.id === "meta_pixel")!;
    assert.equal(pixel.state, "warn");
    assert.match(pixel.detail, /may be inside/);
    assert.ok(r.fixes.some((f) => /GTM container/.test(f)));
  });

  it("no GTM and no pixel: fail with a warning before Meta spend", () => {
    const r = readinessFromTracking(detectTracking("<html></html>", "https://a.in"), BIG);
    assert.equal(r.checks.find((c) => c.id === "meta_pixel")!.state, "fail");
    assert.ok(r.fixes.some((f) => /Meta Pixel before any Instagram\/Facebook spend/.test(f)));
  });

  it("fbq present: pixel passes", () => {
    const r = readinessFromTracking(detectTracking("<script>fbq('track')</script>", "https://a.in"), BIG);
    assert.equal(r.checks.find((c) => c.id === "meta_pixel")!.state, "pass");
  });

  it("tiny budget + weak site routes to a WhatsApp/DM funnel first", () => {
    const t = detectTracking("<html></html>", "https://a.in");
    const tiny = readinessFromTracking(t, { ...SNACK_CHENNAI, budget: 2500 });
    assert.equal(tiny.funnelHint, "whatsapp_dm");
    assert.match(tiny.fixes[0], /WhatsApp or Instagram DMs/);
    assert.equal(readinessFromTracking(t, BIG).funnelHint, undefined);
  });

  it("score is 0-100 and a perfect site scores 100", () => {
    const all = detectTracking(
      `<html><head>${head}<meta property="og:image" content="x"></head><script>fbq(1);gtag(1);GTM-AAAA1</script>
       <a href="https://wa.me/91">w</a><a href="tel:1">t</a><a href="/buy">Buy now</a></html>`,
      "https://a.in"
    );
    assert.equal(readinessFromTracking(all, BIG).score, 100);
  });
});

describe("buildReadiness signal", () => {
  it("skips cleanly when the site was not scraped (zero-key sample brief)", async () => {
    const site = await scrapeSite(SNACK_CHENNAI.domain, SNACK_CHENNAI.product_name);
    const s = buildReadiness(site, SNACK_CHENNAI);
    assert.equal(s.status, "skipped");
    assert.match(s.reason || "", /Non-public domain/);
  });

  it("mock mode reads fixtures/api/site and is badged mock", async () => {
    process.env.ADPILOT_MOCK_APIS = "1";
    const site = await scrapeSite(SNACK_CHENNAI.domain, SNACK_CHENNAI.product_name);
    const s = buildReadiness(site, SNACK_CHENNAI);
    assert.equal(s.status, "ok");
    assert.equal(s.mock, true);
    assert.equal(s.data!.checks.find((c) => c.id === "meta_pixel")!.state, "warn");
    assert.equal(s.data!.checks.find((c) => c.id === "whatsapp")!.state, "pass");
  });
});
