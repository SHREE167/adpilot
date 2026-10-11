import "server-only";
import type { PageSpeedResult, Signal } from "@/lib/types";
import { CACHE_TTL } from "./cache";
import { fetchJson, runSource, skipped } from "./signal";

export const PAGESPEED_SOURCE = "pagespeed";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/**
 * PSI often takes 10-30s. That is fine only because this source is deferred
 * (checkPageSpeed action after render); the plan itself never waits on it.
 */
export const PAGESPEED_TIMEOUT_MS = 45000;

/** The slice of the PSI v5 response we read (everything else is ignored). */
export interface PsiResponse {
  id?: string;
  loadingExperience?: {
    metrics?: { LARGEST_CONTENTFUL_PAINT_MS?: { category?: string } };
  };
  lighthouseResult?: {
    finalUrl?: string;
    categories?: { performance?: { score?: number | null } };
    audits?: { "largest-contentful-paint"?: { numericValue?: number } };
  };
}

const FIELD = new Set(["FAST", "AVERAGE", "SLOW"]);

/** Pure: raw PSI response → PageSpeedResult. Throws when there is no score. */
export function toPageSpeedResult(raw: PsiResponse, url: string): PageSpeedResult {
  const lh = raw.lighthouseResult;
  const perf = lh?.categories?.performance?.score;
  const lcp = lh?.audits?.["largest-contentful-paint"]?.numericValue;
  if (typeof perf !== "number" || typeof lcp !== "number") {
    throw new Error("PageSpeed returned no performance score");
  }
  const field = raw.loadingExperience?.metrics?.LARGEST_CONTENTFUL_PAINT_MS?.category;
  return {
    url: lh?.finalUrl || url,
    strategy: "mobile",
    score: Math.round(perf * 100),
    lcpMs: Math.round(lcp),
    ...(field && FIELD.has(field) ? { fieldLcp: field as PageSpeedResult["fieldLcp"] } : {}),
  };
}

/**
 * Only public http(s) sites: no localhost, raw IPs, or .local/.internal names.
 * Keeps the action from being used to spend our quota on arbitrary targets.
 */
export function publicSiteUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || host === "localhost") return null;
  if (/^[\d.]+$/.test(host) || host.includes(":")) return null;
  if (/\.(local|localhost|internal|test|example|invalid)$/.test(host)) return null;
  u.hash = "";
  return u.toString();
}

function cacheUrl(url: string): string {
  const u = new URL(url);
  return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "") || "/"}`;
}

/** Deferred F1 part B source. Never throws; always a Signal. */
export async function fetchPageSpeed(rawUrl: string | null | undefined): Promise<Signal<PageSpeedResult>> {
  const url = publicSiteUrl(rawUrl);
  if (!url) return skipped(PAGESPEED_SOURCE, "no public site URL to test");
  return runSource<PageSpeedResult>(
    PAGESPEED_SOURCE,
    async (signal) => {
      const qs = new URLSearchParams({
        url,
        strategy: "mobile",
        category: "performance",
        key: process.env.PAGESPEED_API_KEY!,
      });
      // Free: 25k queries/day, 400 per 100s. The 24h cache keeps repeat plans at zero.
      // fetchJson errors carry only "HTTP <status>", so this key-bearing URL is never surfaced.
      const raw = await fetchJson<PsiResponse>(`${ENDPOINT}?${qs}`, signal);
      return toPageSpeedResult(raw, url);
    },
    {
      requiresEnv: ["PAGESPEED_API_KEY"],
      cacheKey: `${PAGESPEED_SOURCE}:v5:mobile:${cacheUrl(url)}`,
      ttlMs: CACHE_TTL.pageSpeed,
      mockKey: new URL(url).hostname,
      timeoutMs: PAGESPEED_TIMEOUT_MS,
    }
  );
}
