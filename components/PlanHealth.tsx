"use client";

import type { ReactNode } from "react";
import { NOT_LOCAL_REASON, showLocalMarket } from "@/components/LocalMarketCard";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { useElapsed, type PageSpeedState } from "@/components/SpeedCheck";
import { seconds } from "@/lib/speed-rules";
import type { PlanResult, Signal } from "@/lib/types";

const PILL =
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] whitespace-nowrap";

interface Item {
  key: string;
  label: string;
  href: string;
  badge: ReactNode;
  /** Why it is not live (tooltip + screen readers). */
  detail?: string;
}

function signalItem(key: string, label: string, href: string, s?: Signal<unknown>): Item {
  return {
    key,
    label,
    href,
    badge: <ProvenanceBadge signal={s} />,
    ...(s && s.status !== "ok" && s.reason ? { detail: s.reason } : {}),
  };
}

function Muted({ children }: { children: ReactNode }) {
  return <span className={`${PILL} border-rule text-fog`}>{children}</span>;
}

/**
 * "Plan health": one glance at where every part of this plan came from.
 * LIVE / MOCK / ESTIMATE / Not connected per source; PageSpeed updates live.
 */
export function PlanHealth({ plan, speed }: { plan: PlanResult; speed: PageSpeedState }) {
  const elapsed = useElapsed(speed.pending ? speed.startedAt : null);
  const e = plan.enrichment;

  if (!plan.planVersion || !e) {
    return (
      <Strip>
        <li className="flex items-center gap-2 text-sm text-fog">
          Saved before v2 data sources: every number is <ProvenanceBadge estimate />
        </li>
      </Strip>
    );
  }

  const places = e.localMarket;
  const items: Item[] = [
    signalItem("site", "Site checks", "#ready", e.siteReadiness),
    places?.reason === NOT_LOCAL_REASON
      ? { key: "places", label: "Google Places", href: "#sources", badge: <Muted>Not needed</Muted>, detail: "online / B2B business: no Maps search" }
      : signalItem("places", "Google Places", showLocalMarket(places) ? "#local" : "#sources", places),
    speed.pending
      ? {
          key: "speed",
          label: "PageSpeed",
          href: "#ready",
          badge: (
            <span className={`${PILL} border-sand/50 text-sand`}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-sand motion-safe:animate-pulse" />
              Checking <span className="num">{seconds(elapsed)}</span>
            </span>
          ),
        }
      : signalItem("speed", "PageSpeed", "#ready", speed.signal),
    { key: "calendar", label: "Festival calendar", href: "#timing", badge: <ProvenanceBadge estimate /> },
    { key: "model", label: "Rate card + XGBoost", href: "#numbers", badge: <ProvenanceBadge estimate /> },
    {
      key: "copy",
      label: "Ad copy",
      href: "#ads",
      badge: <Muted>{plan.llmUsed ? `LLM · ${plan.llmProvider ?? "on"}` : "Templates"}</Muted>,
    },
  ];

  return (
    <Strip>
      {items.map((it) => (
        <li key={it.key}>
          <a
            href={it.href}
            title={it.detail}
            className="flex items-center gap-2 rounded-full px-1 py-0.5 text-sm text-paper outline-none hover:text-sand focus-visible:ring-2 focus-visible:ring-sand"
          >
            {it.label} {it.badge}
            {it.detail ? <span className="sr-only">: {it.detail}</span> : null}
          </a>
        </li>
      ))}
    </Strip>
  );
}

function Strip({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Plan health" className="mx-auto max-w-6xl px-6 pt-6 sm:px-12">
      <div className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <h2 className="kicker shrink-0">Plan health</h2>
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {children}
        </ul>
      </div>
    </section>
  );
}
