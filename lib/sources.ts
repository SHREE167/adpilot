import type { Signal } from "./types";

/** Human labels for Signal.source (client-safe; no keys, no fetch). */
export const SOURCE_LABELS: Record<string, string> = {
  site_readiness: "your site",
  festival_calendar: "festival calendar",
  pagespeed: "PageSpeed",
  google_places: "Google Places",
  meta_reach: "Meta",
  youtube: "YouTube",
  search_demand: "Google Trends",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] || source.replace(/_/g, " ");
}

/** "4 Oct", pinned to IST so server and browser render the same text. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export type Provenance = "live" | "mock" | "off";

export function provenanceOf(signal: Signal<unknown> | undefined): Provenance {
  if (!signal || signal.status !== "ok") return "off";
  return signal.mock ? "mock" : "live";
}

export const STATUS_LABEL: Record<Signal<unknown>["status"], string> = {
  ok: "ok",
  skipped: "skipped",
  timeout: "timed out",
  error: "error",
};
