"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { checkPageSpeed } from "@/app/actions";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { savePlanLocal } from "@/lib/client-storage";
import { seconds, speedBand, type SpeedBand } from "@/lib/speed-rules";
import type { PageSpeedResult, PlanResult, Signal } from "@/lib/types";

const PAGESPEED = "pagespeed";

function clientSignal(status: "skipped" | "error", reason: string): Signal<PageSpeedResult> {
  return { source: PAGESPEED, status, fetchedAt: new Date().toISOString(), ms: 0, cached: false, reason };
}

/** Real wall-clock seconds since `since` (performance.now()), ticking while active. */
export function useElapsed(since: number | null): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (since === null) return;
    setNow(performance.now());
    const t = window.setInterval(() => setNow(performance.now()), 500);
    return () => window.clearInterval(t);
  }, [since]);
  return since === null ? 0 : Math.max(0, now - since);
}

export interface PageSpeedState {
  signal?: Signal<PageSpeedResult>;
  pending: boolean;
  /** performance.now() when the request started; null when not in flight. */
  startedAt: number | null;
}

/**
 * F1 part B, deferred: once the dashboard has rendered, ask the server for
 * PageSpeed (cached 24h). The plan never waits; old plans never trigger it.
 * Every outcome is visible: result, timeout, not connected, or a failure reason.
 */
export function usePageSpeed(plan: PlanResult): PageSpeedState {
  const existing = plan.enrichment?.pageSpeed;
  const v2 = plan.planVersion === 2 && Boolean(plan.enrichment);
  const eligible = v2 && Boolean(plan.site?.scraped);
  const [signal, setSignal] = useState<Signal<PageSpeedResult> | undefined>(
    existing ?? (v2 && !eligible ? clientSignal("skipped", "site was not reachable, nothing to test") : undefined)
  );
  const [pending, setPending] = useState(eligible && !existing);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    const p = planRef.current;
    if (!eligible || p.enrichment?.pageSpeed) return;
    let cancelled = false;
    setPending(true);
    setStartedAt(performance.now());
    checkPageSpeed(p.id, p.site.url)
      .then((s) => {
        if (cancelled) return;
        setSignal(s);
        if (s.status === "ok" && p.enrichment) {
          savePlanLocal({ ...p, enrichment: { ...p.enrichment, pageSpeed: s } });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setSignal(clientSignal("error", err instanceof Error ? err.message : "request failed"));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPending(false);
          setStartedAt(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plan.id, eligible]);

  return { signal, pending, startedAt };
}

const BAND: Record<SpeedBand, { tone: string; word: string }> = {
  good: { tone: "text-mint", word: "fast" },
  needs_work: { tone: "text-sand", word: "could be faster" },
  poor: { tone: "text-danger", word: "slow" },
};

const FIELD_WORD: Record<NonNullable<PageSpeedResult["fieldLcp"]>, string> = {
  FAST: "fast",
  AVERAGE: "average",
  SLOW: "slow",
};

function quietLine(s: Signal<PageSpeedResult>): string {
  if (s.status === "skipped" && /no API key/.test(s.reason || "")) {
    return "Add PAGESPEED_API_KEY to measure how fast this page loads on a phone.";
  }
  if (s.status === "timeout") {
    return `PageSpeed timed out (${s.reason || "no answer in time"}). Open the plan again to retry.`;
  }
  if (s.status === "error") return `Speed check failed: ${s.reason || "unknown error"}.`;
  return s.reason ? `Not run: ${s.reason}.` : "No speed check for this plan.";
}

/** The mobile-speed row inside "What we found". aria-live so the late result is announced. */
export function SpeedRow({
  signal,
  pending,
  startedAt = null,
}: {
  signal?: Signal<PageSpeedResult>;
  pending: boolean;
  startedAt?: number | null;
}) {
  const elapsed = useElapsed(pending ? startedAt : null);
  let body: ReactNode = null;

  if (pending && !signal) {
    body = (
      <p className="flex items-center gap-3 text-fog">
        <span aria-hidden className="h-2 w-2 rounded-full bg-sand motion-safe:animate-pulse" />
        Checking mobile speed with Google PageSpeed…
        <span className="num text-sm" aria-hidden>
          {seconds(elapsed)}
        </span>
        <span className="text-sm">(usually 10–30s; the rest of the plan is ready)</span>
      </p>
    );
  } else if (signal?.status === "ok" && signal.data) {
    const r = signal.data;
    const band = BAND[speedBand(r)];
    body = (
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <p className={`display num leading-none ${band.tone}`}>
          <span className="text-3xl sm:text-4xl">{r.score}</span>
          <span className="ml-1 text-lg text-fog">/100</span>
        </p>
        <div className="min-w-0 flex-1">
          <p className="text-paper">
            Mobile speed: <span className={band.tone}>{band.word}</span>
          </p>
          <p className="text-sm text-fog">
            Main content shows in <span className="num text-paper">{seconds(r.lcpMs)}</span> (LCP, lab
            test)
            {r.fieldLcp ? ` · real visitors: ${FIELD_WORD[r.fieldLcp]}` : ""}
            {signal.cached ? " · cached" : signal.ms ? ` · checked in ${seconds(signal.ms)}` : ""}
          </p>
        </div>
        <ProvenanceBadge signal={signal} />
      </div>
    );
  } else if (signal) {
    body = (
      <p className="flex flex-wrap items-center gap-3 text-sm text-fog">
        <span className="text-paper">Mobile speed</span>
        <ProvenanceBadge signal={signal} />
        <span>{quietLine(signal)}</span>
      </p>
    );
  }

  if (!body) return null;
  return (
    <div className="mt-6 border-t border-rule pt-6" aria-live="polite">
      {body}
    </div>
  );
}
