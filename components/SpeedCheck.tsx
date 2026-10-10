"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { checkPageSpeed } from "@/app/actions";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { savePlanLocal } from "@/lib/client-storage";
import { seconds, speedBand, type SpeedBand } from "@/lib/speed-rules";
import type { PageSpeedResult, PlanResult, Signal } from "@/lib/types";

/**
 * F1 part B, deferred: once the dashboard has rendered, ask the server for
 * PageSpeed (cached 24h). The plan never waits; old plans never trigger it.
 */
export function usePageSpeed(plan: PlanResult): {
  signal?: Signal<PageSpeedResult>;
  pending: boolean;
} {
  const existing = plan.enrichment?.pageSpeed;
  const eligible = plan.planVersion === 2 && Boolean(plan.enrichment) && Boolean(plan.site?.scraped);
  const [signal, setSignal] = useState<Signal<PageSpeedResult> | undefined>(existing);
  const [pending, setPending] = useState(eligible && !existing);
  const planRef = useRef(plan);
  planRef.current = plan;

  useEffect(() => {
    const p = planRef.current;
    if (!eligible || p.enrichment?.pageSpeed) return;
    let cancelled = false;
    setPending(true);
    checkPageSpeed(p.id, p.site.url)
      .then((s) => {
        if (cancelled) return;
        setSignal(s);
        if (s.status === "ok" && p.enrichment) {
          savePlanLocal({ ...p, enrichment: { ...p.enrichment, pageSpeed: s } });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [plan.id, eligible]);

  return { signal, pending };
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
  if (s.status === "timeout") return "PageSpeed did not answer in time. Open the plan again to retry.";
  return s.reason ? `No speed check: ${s.reason}.` : "No speed check for this plan.";
}

/** The mobile-speed row inside "What we found". aria-live so the late result is announced. */
export function SpeedRow({
  signal,
  pending,
}: {
  signal?: Signal<PageSpeedResult>;
  pending: boolean;
}) {
  let body: ReactNode = null;

  if (pending && !signal) {
    body = (
      <p className="flex items-center gap-3 text-fog">
        <span aria-hidden className="h-2 w-2 rounded-full bg-sand motion-safe:animate-pulse" />
        Checking mobile speed with Google PageSpeed…
      </p>
    );
  } else if (signal?.status === "ok" && signal.data) {
    const r = signal.data;
    const band = BAND[speedBand(r)];
    body = (
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <p className={`display num leading-none ${band.tone}`}>
          <span className="text-5xl sm:text-6xl">{r.score}</span>
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
    <div className="mt-6 border-t border-white/10 pt-6" aria-live="polite">
      {body}
    </div>
  );
}
