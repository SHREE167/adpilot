"use client";

import { useState } from "react";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import type { EnrichmentBundle, KitChannel, LaunchKit as Kit, Signal } from "@/lib/types";

/** The kit is always English; the brief's language only describes the audience. */
const LABELS: Record<string, string> = {
  who: "Who",
  when: "When",
  make: "Make",
  keywords: "Keywords",
  week: "First week",
  watch: "Watch",
  spec: "Exact Meta targeting spec",
};

function Checklist({ items, id }: { items: string[]; id: string }) {
  const [done, setDone] = useState<boolean[]>(() => items.map(() => false));
  return (
    <ul className="space-y-3">
      {items.map((t, i) => (
        <li key={`${id}-${i}`}>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1.5 h-4 w-4 shrink-0 accent-[var(--sand)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sand"
              checked={done[i]}
              onChange={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
            />
            <span className={done[i] ? "text-fog line-through decoration-sand/60" : "text-paper"}>{t}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

function ChannelKit({ c, L, signals }: { c: KitChannel; L: Record<string, string>; signals: Signal<unknown>[] }) {
  const used = signals.filter((s) => c.sources.includes(s.source));
  return (
    <article className="story-bit card panel">
      <h3 className="display text-2xl leading-tight">{c.name}</h3>
      <p className="num mt-3 text-sm leading-snug text-sand">{c.headline}</p>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fog">
        <ProvenanceBadge estimate />
        {used.map((s) => (
          <ProvenanceBadge key={s.source} signal={s} />
        ))}
      </p>

      <dl className="mt-6 grid gap-y-4 border-t border-rule pt-5">
        <div>
          <dt className="text-sm text-fog">{L.who}</dt>
          <dd className="mt-1 text-paper">
            {c.targeting.text}
            {c.targeting.spec ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-sm text-sand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
                  {L.spec}
                </summary>
                <pre className="card mt-3 overflow-x-auto p-4 text-xs text-fog">{JSON.stringify(c.targeting.spec, null, 2)}</pre>
              </details>
            ) : null}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-fog">{L.when}</dt>
          <dd className="mt-1 text-paper">{c.schedule.text}</dd>
        </div>
        <div>
          <dt className="text-sm text-fog">{L.make}</dt>
          <dd className="mt-1 text-paper">{c.creatives.text}</dd>
        </div>
        {c.keywords.length ? (
          <div>
            <dt className="text-sm text-fog">{L.keywords}</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {c.keywords.map((k) => (
                <span key={k} className="rounded-md border border-sand/30 bg-sand/10 px-2.5 py-1 text-sm text-sand">
                  {k}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-sm text-fog">{L.week}</dt>
          <dd className="mt-2">
            <Checklist items={c.checklist} id={c.channelId} />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-fog">{L.watch}</dt>
          <dd className="mt-1">
            <p className="text-paper">{c.metric.name}</p>
            <p className="mt-1 text-sm text-fog">{c.metric.why}</p>
          </dd>
        </div>
      </dl>
    </article>
  );
}

/** F7: the launch kit; the section title comes from the dashboard's section header. */
export function LaunchKit({ kit, enrichment }: { kit: Kit; enrichment?: EnrichmentBundle }) {
  const L = LABELS;
  const signals = Object.values(enrichment || {}).filter((s): s is Signal<unknown> => Boolean(s));
  const llm = kit.wording !== "template";
  return (
    <>
      <p className="story-bit measure mx-auto text-center text-fog">
        {llm ? `Worded by ${kit.wording}. ` : "Template wording. Add a Gemini or Groq key for plainer wording. "}
        {kit.guard.checked
          ? `The grounding guard checked ${kit.guard.checked} numbers against the plan and its data sources${kit.guard.removed ? ` and removed ${kit.guard.removed} it could not trace` : "; all traced"}.`
          : "Every number below comes from the plan or a data source."}
        {kit.guard.nonEnglish ? ` ${kit.guard.nonEnglish} reworded lines were not in English and were replaced with the template wording.` : ""}
      </p>
      <div className="grid-2 mt-8">
        {kit.channels.map((c) => (
          <ChannelKit key={c.channelId} c={c} L={L} signals={signals} />
        ))}
      </div>
    </>
  );
}
