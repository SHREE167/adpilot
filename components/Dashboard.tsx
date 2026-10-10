"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MixPie, ImpressionsBar, WeeklyLine } from "@/components/Charts";
import { DataSources } from "@/components/DataSources";
import { EstimateBadge } from "@/components/EstimateBadge";
import { CountUp, StoryScene } from "@/components/Motion";
import { LocalMarketCard, showLocalMarket } from "@/components/LocalMarketCard";
import { PlanHealth } from "@/components/PlanHealth";
import { ReadinessCard } from "@/components/ReadinessCard";
import { usePageSpeed } from "@/components/SpeedCheck";
import { TimingCard } from "@/components/TimingCard";
import { ZeroRupeeCard } from "@/components/ZeroRupeeCard";
import { CHANNEL_COLORS } from "@/lib/colors";
import { compactNumber, ctrPct, inr, pct } from "@/lib/format";
import { planToMarkdown } from "@/lib/markdown";
import type { PlacementPick, PlanResult, Signal } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  google_site: "Google site (GDN)",
  google_app: "Google app",
  keyword_theme: "Google Search queries",
  publisher: "Publisher / community",
  app: "App",
  format: "Format / inventory",
};

function PlacementScene({ p }: { p: PlacementPick }) {
  return (
    <StoryScene className="story-chapter">
      <p className="story-bit kicker">{KIND_LABEL[p.kind] || p.kind}</p>
      <h2 className="story-bit display mt-4 max-w-[16ch] text-5xl leading-[0.92] sm:text-7xl">
        {p.name}
      </h2>
      <p className="story-bit num mt-8 text-2xl text-sand sm:text-4xl">{p.target}</p>
      <p className="story-bit mt-8 max-w-3xl text-2xl leading-snug text-fog">{p.why}</p>
      <p className="story-bit mt-6 text-xl">
        Do this: <span className="text-paper">{p.action}</span>
      </p>
      <p className="story-bit mt-4 text-fog">
        Parent channel: {p.channelName} · fit {p.fit}
      </p>
    </StoryScene>
  );
}

function Chapter({
  n,
  of,
  title,
}: {
  n: string;
  of: string;
  title: string;
}) {
  return (
    <p className="story-bit kicker mb-6">
      {n} / {of}
      <span className="mx-3 text-fog">—</span>
      {title}
    </p>
  );
}

export function Dashboard({ plan }: { plan: PlanResult }) {
  const [copied, setCopied] = useState(false);
  const md = useMemo(() => planToMarkdown(plan), [plan]);
  const mixSum = plan.mix.reduce((s, r) => s + r.budget, 0);
  const name = plan.product?.recognizedName || plan.input.product_name;

  function exportMd() {
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${plan.input.product_name.replace(/\s+/g, "-").toLowerCase()}-adpilot.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyMd() {
    await navigator.clipboard.writeText(md);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  const readiness = plan.enrichment?.siteReadiness;
  const speed = usePageSpeed(plan);
  const calendar = plan.enrichment?.calendar;
  const localMarket = plan.enrichment?.localMarket;
  const showLocal = showLocalMarket(localMarket);
  const zeroRupee = plan.zeroRupee || [];
  const signals = Object.values(plan.enrichment || {}).filter((s): s is Signal<unknown> => Boolean(s));
  const chapterIds = [
    "cover",
    plan.product ? "read" : null,
    readiness ? "ready" : null,
    showLocal ? "local" : null,
    zeroRupee.length ? "free" : null,
    calendar ? "timing" : null,
    "numbers",
    "mix",
    (plan.placements || []).length ? "post" : null,
    "charts",
    "cuts",
    "ads",
    "outreach",
  ].filter((id): id is string => Boolean(id));
  const pad = (n: number) => String(n).padStart(2, "0");
  const chapter = (id: string) => ({
    n: pad(chapterIds.indexOf(id) + 1),
    of: pad(chapterIds.length),
  });

  const cpa = plan.totals.estimatedCpa;
  const kpis = useMemo(
    () => [
      { label: "Spend", value: plan.totals.budget, format: inr },
      { label: "Impressions", value: plan.totals.impressions, format: compactNumber },
      { label: "Clicks", value: plan.totals.clicks, format: compactNumber },
      { label: "Reach", value: plan.totals.reach, format: compactNumber },
      {
        label: "Conversions",
        value: plan.totals.conversions,
        format: (n: number) => n.toFixed(1),
      },
      {
        label: "CPA",
        value: cpa ?? 0,
        format: (n: number) => (cpa ? inr(n) : "—"),
      },
    ],
    [plan.totals, cpa]
  );

  return (
    <div className="story-reel">
      <nav className="story-dots hidden lg:flex">
        {[...chapterIds, "sources"].map((id, i) => (
          <a key={id} href={`#${id}`} className="story-dot" title={id}>
            {String(i + 1).padStart(2, "0")}
          </a>
        ))}
      </nav>

      <PlanHealth plan={plan} speed={speed} />

      <StoryScene id="cover" className="story-chapter">
        <Chapter {...chapter("cover")} title="Cover" />
        <p className="story-bit kicker">A plan for {plan.input.city}</p>
        <h1 className="story-bit display mt-4 max-w-[18ch] text-6xl leading-[0.9] sm:text-8xl">
          {name}
        </h1>
        <p className="story-bit mt-8 max-w-2xl text-xl leading-relaxed text-fog sm:text-2xl">
          {inr(plan.input.budget)} a month · {plan.input.goal} · {plan.category}/
          {plan.priceTier} · {plan.input.language}
        </p>
        <div className="story-bit mt-10 flex flex-wrap gap-3">
          <EstimateBadge />
          <button className="btn btn-ghost" type="button" onClick={exportMd}>
            Export markdown
          </button>
          <button className="btn btn-ghost" type="button" onClick={copyMd}>
            {copied ? "Copied" : "Copy markdown"}
          </button>
          <Link className="btn btn-ghost" href={`/compare?a=${plan.id}`}>
            Compare
          </Link>
        </div>
        <p className="story-bit mt-16 text-sm uppercase tracking-[0.3em] text-sand">
          Scroll the story ↓
        </p>
      </StoryScene>

      {plan.product ? (
        <StoryScene id="read" className="story-chapter">
          <Chapter {...chapter("read")} title="We read the product" />
          <h2 className="story-bit display text-5xl leading-[0.95] sm:text-7xl">
            {plan.product.recognizedName}
          </h2>
          <p className="story-bit mt-6 text-lg uppercase tracking-[0.18em] text-sand">
            {plan.product.source} · {Math.round(plan.product.confidence * 100)}% confidence ·{" "}
            {plan.product.tone}
          </p>
          <p className="story-bit mt-8 max-w-3xl text-2xl leading-snug text-fog">
            {plan.product.summary}
          </p>
          <div className="story-bit mt-10 flex flex-wrap gap-3">
            {(plan.product.differentiators || []).map((d) => (
              <span
                key={d}
                className="rounded-full border border-sand/30 bg-sand/10 px-5 py-2 text-sm text-sand"
              >
                {d}
              </span>
            ))}
          </div>
          <ul className="story-bit mt-12 max-w-3xl space-y-3 text-lg text-fog">
            {(plan.product.evidence || []).map((e) => (
              <li key={e}>↳ {e}</li>
            ))}
          </ul>
        </StoryScene>
      ) : null}

      {readiness ? (
        <StoryScene id="ready" className="story-chapter">
          <Chapter {...chapter("ready")} title="Before the first rupee" />
          <ReadinessCard
            signal={readiness}
            domain={plan.site?.domain || plan.input.domain}
            speed={speed.signal}
            speedPending={speed.pending}
            speedStartedAt={speed.startedAt}
          />
        </StoryScene>
      ) : null}

      {localMarket && showLocal ? (
        <StoryScene id="local" className="story-chapter">
          <Chapter {...chapter("local")} title="Your street" />
          <LocalMarketCard signal={localMarket} city={plan.input.city} />
        </StoryScene>
      ) : null}

      {zeroRupee.length ? (
        <StoryScene id="free" className="story-chapter">
          <Chapter {...chapter("free")} title="Before you spend anything" />
          <ZeroRupeeCard items={zeroRupee} signals={signals} />
        </StoryScene>
      ) : null}

      {calendar ? (
        <StoryScene id="timing" className="story-chapter">
          <Chapter {...chapter("timing")} title="Timing" />
          <TimingCard signal={calendar} city={plan.input.city} />
        </StoryScene>
      ) : null}

      <StoryScene id="numbers" className="story-chapter">
        <Chapter {...chapter("numbers")} title="The estimate" />
        <h2 className="story-bit display mb-16 text-5xl sm:text-7xl">What ₹ buys.</h2>
        <div className="grid gap-16">
          {kpis.map((k) => (
            <div key={k.label} className="story-bit border-t border-white/10 pt-8">
              <p className="text-sm uppercase tracking-[0.22em] text-sand">
                {k.label} <EstimateBadge className="ml-2" />
              </p>
              <p className="num display mt-3 text-6xl leading-none text-paper sm:text-8xl">
                <CountUp value={k.value} format={k.format} />
              </p>
            </div>
          ))}
        </div>
        <p className="story-bit mt-16 max-w-2xl text-fog">
          {plan.disclaimer} Mix sums to {inr(mixSum)}.
        </p>
      </StoryScene>

      <div id="mix">
        {plan.mix.map((row, i) => (
          <StoryScene
            key={row.channelId}
            className="story-chapter"
          >
            <Chapter
              {...chapter("mix")}
              title={`Channel ${i + 1} of ${plan.mix.length}`}
            />
            <p className="story-bit inline-flex items-center gap-3 text-xl">
              <span
                className="h-4 w-4 rounded-full"
                style={{ background: CHANNEL_COLORS[row.channelId] }}
              />
              {row.name}
            </p>
            <p className="story-bit display mt-4 text-[22vw] leading-[0.8] text-sand sm:text-[12rem]">
              <CountUp value={row.percent} format={(n) => pct(n, 0)} />
            </p>
            <p className="story-bit num mt-2 text-4xl sm:text-6xl">
              <CountUp value={row.budget} format={inr} />
            </p>
            <p className="story-bit mt-8 max-w-3xl text-2xl leading-snug text-fog">
              {row.explanation}
            </p>
            <p className="story-bit mt-8 text-lg text-fog">
              Score {row.score} · {compactNumber(row.forecast.impressions)} impr. ·{" "}
              {compactNumber(row.forecast.clicks)} clicks · CTR {ctrPct(row.forecast.ctr)}
            </p>
          </StoryScene>
        ))}
      </div>

      {(plan.placements || []).length ? (
        <div id="post">
          <StoryScene className="story-chapter">
            <Chapter {...chapter("post")} title="Where to actually post" />
            <h2 className="story-bit display max-w-[14ch] text-5xl leading-[0.92] sm:text-7xl">
              Not “Google”. These sites and apps.
            </h2>
            <p className="story-bit mt-8 max-w-3xl text-2xl text-fog">
              Generic platforms are useless as a brief. Add these as managed
              placements, apps, or keyword themes. ESTIMATE inventory — we do
              not log into Google Ads.
            </p>
          </StoryScene>
          {(plan.placements || []).map((p) => (
            <PlacementScene key={`${p.channelId}-${p.target}`} p={p} />
          ))}
        </div>
      ) : null}

      <StoryScene id="charts" className="story-chapter">
        <Chapter {...chapter("charts")} title="The pictures" />
        <h2 className="story-bit display mb-12 text-5xl sm:text-7xl">Mix, reach, weeks.</h2>
        <div className="grid gap-10">
          <div className="story-bit card p-6 sm:p-10">
            <h3 className="mb-4 text-xl">Budget mix</h3>
            <MixPie plan={plan} />
          </div>
          <div className="story-bit card p-6 sm:p-10">
            <h3 className="mb-4 text-xl">Impressions by channel</h3>
            <ImpressionsBar plan={plan} />
          </div>
          <div className="story-bit card p-6 sm:p-10">
            <h3 className="mb-4 text-xl">Weekly pacing</h3>
            <WeeklyLine plan={plan} />
          </div>
        </div>
      </StoryScene>

      <StoryScene id="cuts" className="story-chapter">
        <Chapter {...chapter("cuts")} title="What we cut" />
        <h2 className="story-bit display mb-12 text-5xl sm:text-7xl">Not these.</h2>
        <ul className="space-y-12">
          {plan.rejected.map((r) => (
            <li key={r.channelId} className="story-bit border-t border-white/10 pt-8">
              <p className="display text-4xl sm:text-5xl">
                {r.name}{" "}
                <span className="num text-2xl text-fog">({r.score})</span>
              </p>
              <p className="mt-3 text-xl text-fog">
                {r.rejectReason || "Not selected in the 2–5 mix"}
              </p>
              <p className="mt-2 text-fog">{r.reasons.slice(0, 3).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </StoryScene>

      <div id="ads">
        {plan.adAngles.map((a, i) => (
          <StoryScene key={a.headline} className="story-chapter">
            <Chapter {...chapter("ads")} title={`Ad angle ${i + 1}`} />
            <h2 className="story-bit display max-w-[16ch] text-5xl leading-[0.95] sm:text-7xl">
              {a.headline}
            </h2>
            <p className="story-bit mt-10 max-w-3xl text-2xl leading-snug text-fog">
              {a.primaryText}
            </p>
            <p className="story-bit mt-10">
              <span className="rounded-full bg-sand px-6 py-3 text-lg font-bold text-[#2a1608]">
                {a.cta}
              </span>
            </p>
            <p className="story-bit mt-6 text-fog">{a.channelHint}</p>
          </StoryScene>
        ))}
      </div>

      <div id="outreach">
        {plan.outreach.map((o, i) => (
          <StoryScene key={`${o.channel}-${i}`} className="story-chapter">
            <Chapter {...chapter("outreach")} title={`Script ${i + 1} of ${plan.outreach.length}`} />
            <p className="story-bit text-xl uppercase tracking-[0.2em] text-mint">
              {o.channel}
            </p>
            <h2 className="story-bit display mt-4 text-4xl sm:text-6xl">{o.title}</h2>
            <pre className="story-bit mt-10 max-w-3xl whitespace-pre-wrap font-sans text-xl leading-relaxed text-fog">
              {o.body}
            </pre>
          </StoryScene>
        ))}
      </div>

      <DataSources plan={plan} />
    </div>
  );
}
