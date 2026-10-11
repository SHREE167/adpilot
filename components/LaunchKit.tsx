"use client";

import { useState } from "react";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import type { EnrichmentBundle, KitChannel, LaunchKit as Kit, Signal } from "@/lib/types";

/** Fixed labels in the brief's language; the kit text itself is template English or LLM-worded. */
const LABELS: Record<string, Record<string, string>> = {
  english: {
    who: "Who",
    when: "When",
    make: "Make",
    keywords: "Keywords",
    week: "First week",
    watch: "Watch",
    spec: "Exact Meta targeting spec",
  },
  tamil: {
    who: "யாருக்கு",
    when: "எப்போது",
    make: "என்ன செய்ய",
    keywords: "தேடல் சொற்கள்",
    week: "முதல் வாரம்",
    watch: "கவனிக்க",
    spec: "Meta targeting spec",
  },
  hindi: {
    who: "किसे",
    when: "कब",
    make: "क्या बनाएं",
    keywords: "कीवर्ड",
    week: "पहला हफ़्ता",
    watch: "इस पर नज़र रखें",
    spec: "Meta targeting spec",
  },
};

function labelsFor(language: string): Record<string, string> {
  return LABELS[language.trim().toLowerCase()] ?? LABELS.english;
}

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
    <article className="story-bit border-t border-rule pt-8">
      <h3 className="display text-4xl leading-tight sm:text-5xl">{c.name}</h3>
      <p className="num mt-4 max-w-[70ch] text-lg leading-snug text-sand">{c.headline}</p>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-fog">
        <ProvenanceBadge estimate />
        {used.map((s) => (
          <ProvenanceBadge key={s.source} signal={s} />
        ))}
      </p>

      <dl className="mt-8 grid gap-x-6 gap-y-5 text-lg sm:grid-cols-[9rem_1fr]">
        <dt className="text-fog">{L.who}</dt>
        <dd className="text-paper">
          {c.targeting.text}
          {c.targeting.spec ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-base text-sand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
                {L.spec}
              </summary>
              <pre className="card mt-3 overflow-x-auto p-4 text-sm text-fog">{JSON.stringify(c.targeting.spec, null, 2)}</pre>
            </details>
          ) : null}
        </dd>
        <dt className="text-fog">{L.when}</dt>
        <dd className="text-paper">{c.schedule.text}</dd>
        <dt className="text-fog">{L.make}</dt>
        <dd className="text-paper">{c.creatives.text}</dd>
        {c.keywords.length ? (
          <>
            <dt className="text-fog">{L.keywords}</dt>
            <dd className="flex flex-wrap gap-2">
              {c.keywords.map((k) => (
                <span key={k} className="rounded-full border border-sand/30 bg-sand/10 px-3 py-1 text-sm text-sand">
                  {k}
                </span>
              ))}
            </dd>
          </>
        ) : null}
        <dt className="text-fog">{L.week}</dt>
        <dd>
          <Checklist items={c.checklist} id={c.channelId} />
        </dd>
        <dt className="text-fog">{L.watch}</dt>
        <dd>
          <p className="text-paper">{c.metric.name}</p>
          <p className="mt-1 text-base text-fog">{c.metric.why}</p>
        </dd>
      </dl>
    </article>
  );
}

/** F7: the "Launch kit" chapter. */
export function LaunchKit({ kit, enrichment }: { kit: Kit; enrichment?: EnrichmentBundle }) {
  const L = labelsFor(kit.language);
  const signals = Object.values(enrichment || {}).filter((s): s is Signal<unknown> => Boolean(s));
  const llm = kit.wording !== "template";
  return (
    <>
      <h2 className="story-bit display max-w-[16ch] text-5xl leading-[0.95] sm:text-7xl">
        What to set up on day one.
      </h2>
      <p className="story-bit mt-8 max-w-3xl text-xl text-fog">
        {llm ? `Worded by ${kit.wording} in ${kit.language}. ` : `Template wording. Add an LLM key for ${kit.language} wording. `}
        {kit.guard.checked
          ? `The grounding guard checked ${kit.guard.checked} numbers against the plan and its data sources${kit.guard.removed ? ` and removed ${kit.guard.removed} it could not trace` : "; all traced"}.`
          : "Every number below comes from the plan or a data source."}
      </p>
      <div className="mt-12 max-w-3xl space-y-16">
        {kit.channels.map((c) => (
          <ChannelKit key={c.channelId} c={c} L={L} signals={signals} />
        ))}
      </div>
    </>
  );
}
