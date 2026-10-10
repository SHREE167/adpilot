import type {
  PlanInput,
  ReadinessCheck,
  ReadinessCheckId,
  Signal,
  SiteReadiness,
  SiteSnapshot,
  TrackingSignals,
} from "@/lib/types";

export const READINESS_SOURCE = "site_readiness";

const TINY_BUDGET = 3000;
const WEAK_SITE = 60;

/** Points per check; sums to 100. pass = full, warn = half, fail = 0. */
const WEIGHTS: Record<ReadinessCheckId, number> = {
  https: 15,
  viewport: 15,
  meta_pixel: 15,
  ga4: 10,
  gtm: 5,
  whatsapp: 15,
  tel: 10,
  cta: 10,
  og_image: 5,
};

/** Fix copy in priority order (first = most urgent). */
const FIX_ORDER: ReadinessCheckId[] = [
  "https",
  "viewport",
  "meta_pixel",
  "whatsapp",
  "cta",
  "ga4",
  "tel",
  "og_image",
  "gtm",
];

function buildChecks(t: TrackingSignals): ReadinessCheck[] {
  const gtm = t.gtmIds.length > 0;
  const gtmLabel = gtm ? t.gtmIds.join(", ") : "";
  return [
    {
      id: "https",
      label: "HTTPS",
      state: t.https ? "pass" : "fail",
      detail: t.https ? "Served over HTTPS" : "Site is not on HTTPS; browsers warn visitors",
    },
    {
      id: "viewport",
      label: "Mobile viewport",
      state: t.viewport ? "pass" : "fail",
      detail: t.viewport ? "Viewport meta tag found" : "No viewport meta tag; page may render tiny on phones",
    },
    {
      id: "meta_pixel",
      label: "Meta Pixel",
      state: t.metaPixel ? "pass" : gtm ? "warn" : "fail",
      detail: t.metaPixel
        ? "fbq / fbevents.js found"
        : gtm
          ? `GTM found (${gtmLabel}); a pixel may be inside it`
          : "No Meta Pixel found",
    },
    {
      id: "ga4",
      label: "Google Analytics 4",
      state: t.ga4 ? "pass" : gtm ? "warn" : "fail",
      detail: t.ga4
        ? "gtag / GA4 tag found"
        : gtm
          ? "GTM found; GA4 may be inside it"
          : "No GA4 tag found",
    },
    {
      id: "gtm",
      label: "Google Tag Manager",
      state: gtm ? "pass" : "warn",
      detail: gtm ? `Container ${gtmLabel}` : "No GTM container (optional)",
    },
    {
      id: "whatsapp",
      label: "WhatsApp click-to-chat",
      state: t.whatsapp ? "pass" : "fail",
      detail: t.whatsapp ? "wa.me / WhatsApp link found" : "No WhatsApp link",
    },
    {
      id: "tel",
      label: "Tap-to-call",
      state: t.tel ? "pass" : "warn",
      detail: t.tel ? "tel: link found" : "No tel: link",
    },
    {
      id: "cta",
      label: "Visible call to action",
      state: t.cta ? "pass" : "warn",
      detail: t.cta ? "Order / buy / call / book button found" : "No clear order, buy, call or book button",
    },
    {
      id: "og_image",
      label: "Share image (og:image)",
      state: t.ogImage ? "pass" : "warn",
      detail: t.ogImage ? "og:image set" : "No og:image; shared links show no picture",
    },
  ];
}

const FIX_COPY: Record<ReadinessCheckId, (c: ReadinessCheck) => string> = {
  https: () => "Move the site to HTTPS before sending paid traffic.",
  viewport: () => "Add a mobile viewport tag: almost every ad click in India is on a phone.",
  meta_pixel: (c) =>
    c.state === "warn"
      ? "Open your GTM container and confirm a Meta Pixel tag fires before Instagram/Facebook spend."
      : "Install the Meta Pixel before any Instagram/Facebook spend, or you cannot measure or retarget.",
  ga4: (c) =>
    c.state === "warn"
      ? "Confirm GA4 is configured inside GTM so you can see which channel sold."
      : "Add GA4 (free) so you can see which channel actually sold.",
  gtm: () => "Optional: a GTM container makes adding pixels later a one-time job.",
  whatsapp: () => "Add a WhatsApp click-to-chat link (wa.me/91XXXXXXXXXX) next to every CTA.",
  tel: () => "Add a tap-to-call link for people who would rather phone.",
  cta: () => "Put one clear Order / Call / Book button above the fold.",
  og_image: () => "Set an og:image so links shared on WhatsApp show a picture.",
};

export function scoreReadiness(checks: ReadinessCheck[]): number {
  const pts = checks.reduce((sum, c) => {
    const w = WEIGHTS[c.id];
    return sum + (c.state === "pass" ? w : c.state === "warn" ? w / 2 : 0);
  }, 0);
  return Math.round(pts);
}

export function readinessFromTracking(t: TrackingSignals, input: PlanInput): SiteReadiness {
  const checks = buildChecks(t);
  const score = scoreReadiness(checks);
  const byId = new Map(checks.map((c) => [c.id, c]));
  const fixes = FIX_ORDER.map((id) => byId.get(id)!)
    .filter((c) => c.state !== "pass" && c.id !== "gtm")
    .map((c) => FIX_COPY[c.id](c));

  const tiny = input.budget < TINY_BUDGET && score < WEAK_SITE;
  if (tiny) {
    fixes.unshift(
      "Small budget and the site is not ready: send ad clicks to WhatsApp or Instagram DMs, not the website."
    );
  }
  return { score, checks, fixes, ...(tiny ? { funnelHint: "whatsapp_dm" as const } : {}) };
}

/** Step 3 source: turns the scrape's detections into a Signal. Never throws. */
export function buildReadiness(site: SiteSnapshot, input: PlanInput): Signal<SiteReadiness> {
  const t0 = Date.now();
  const fetchedAt = site.fetchedAt || new Date().toISOString();
  if (!site.scraped || !site.tracking) {
    return {
      source: READINESS_SOURCE,
      status: "skipped",
      fetchedAt,
      ms: 0,
      cached: false,
      reason: site.scrapeError || "Site not scraped",
    };
  }
  return {
    source: READINESS_SOURCE,
    status: "ok",
    fetchedAt,
    ms: Date.now() - t0,
    cached: false,
    ...(site.mock ? { mock: true, reason: "mock fixture" } : {}),
    data: readinessFromTracking(site.tracking, input),
  };
}
