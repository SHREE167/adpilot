"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MixPie, ImpressionsBar, WeeklyLine } from "@/components/Charts";
import { BudgetSlider } from "@/components/BudgetSlider";
import { DataSources } from "@/components/DataSources";
import { EstimateBadge } from "@/components/EstimateBadge";
import { AudienceCard } from "@/components/AudienceCard";
import { CreatorsCard } from "@/components/CreatorsCard";
import { CountUp, StoryScene } from "@/components/Motion";
import { LaunchKit } from "@/components/LaunchKit";
import { LocalMarketCard, showLocalMarket } from "@/components/LocalMarketCard";
import { PlanHealth } from "@/components/PlanHealth";
import { ReadinessCard } from "@/components/ReadinessCard";
import { RealityCard } from "@/components/RealityCard";
import { ShapWaterfall } from "@/components/ShapWaterfall";
import { usePageSpeed } from "@/components/SpeedCheck";
import { TimingCard } from "@/components/TimingCard";
import { useTheme } from "@/components/ThemeToggle";
import { ZeroRupeeCard } from "@/components/ZeroRupeeCard";
import { channelColors } from "@/lib/theme";
import { compactNumber, ctrPct, inr, pct } from "@/lib/format";
import { planToMarkdown } from "@/lib/markdown";
import { rangesOf, rangeText, totalsRangesOf } from "@/lib/ranges";
import { scenarioAt, sliderSteps, transitions } from "@/lib/scenario";
import type { ChannelForecast, ForecastRange, PlanResult, Signal } from "@/lib/types";

const KIND_LABEL: Record<string, string> = {
  google_site: "Google site (GDN)",
  google_app: "Google app",
  keyword_theme: "Google Search queries",
  publisher: "Publisher / community",
  app: "App",
  format: "Format / inventory",
};

/** Centered section header: chapter number, title, optional one-line subtitle. */
function SectionHead({
  n,
  of,
  title,
  sub,
  note,
}: {
  n: string;
  of: string;
  title: string;
  sub?: ReactNode;
  note?: string;
}) {
  return (
    <header className="section-head">
      <p className="story-bit kicker num">
        {n} / {of}
      </p>
      <h2 className="story-bit display">{title}</h2>
      {sub ? <p className="story-bit sub">{sub}</p> : null}
      {note ? (
        <p className="mx-auto mt-3 inline-block rounded-md border border-rule-strong px-3 py-1 text-sm text-fog" role="note">
          {note}
        </p>
      ) : null}
    </header>
  );
}

/** Reach / clicks / conversions as mid with low–high, and where the band comes from. */
function ChannelRanges({ forecast }: { forecast: ChannelForecast }) {
  const r = rangesOf(forecast);
  const rows: [string, ForecastRange, (n: number) => string, string][] = [
    ["Reach", r.reach, compactNumber, (r.reachBand ?? r.band).label],
    ["Clicks", r.clicks, compactNumber, r.band.label],
    ["Conversions", r.conversions, (n) => n.toFixed(1), r.band.label],
  ];
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-tint p-3 text-sm">
      {rows.map(([label, range, fmt, band]) => (
        <div key={label} className="min-w-0">
          <dt className="text-fog">{label}</dt>
          <dd className="num mt-1 text-paper">{fmt(range.mid)}</dd>
          <dd className="num text-xs text-fog" title={band}>
            {rangeText(range, fmt)}
          </dd>
          <dd className={`text-[11px] ${band === "default band" ? "text-fog" : "text-mint"}`}>{band}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A grid cell that spans both columns when its partner is missing. */
function Cell({ id, alone, children }: { id?: string; alone?: boolean; children: ReactNode }) {
  return (
    <div id={id} className={`card panel scroll-mt-24 ${alone ? "span-all" : ""}`}>
      {children}
    </div>
  );
}

export function Dashboard({ plan: saved }: { plan: PlanResult }) {
  const [copied, setCopied] = useState(false);
  const md = useMemo(() => planToMarkdown(saved), [saved]);

  // F11: budget slider. The saved plan is the source; `plan` below is the view at the slider budget.
  const grid = saved.budgetGrid;
  const steps = useMemo(() => (grid ? sliderSteps(grid) : []), [grid]);
  const moves = useMemo(() => (grid ? transitions(saved, steps) : []), [saved, grid, steps]);
  const [budget, setBudget] = useState<number>(grid?.base ?? saved.input.budget);
  const shownBudget = useDeferredValue(budget);
  const scenario = useMemo(
    () => (grid && shownBudget !== grid.base ? scenarioAt(saved, shownBudget) : null),
    [saved, grid, shownBudget]
  );
  const plan: PlanResult = useMemo(
    () =>
      scenario
        ? {
            ...saved,
            input: { ...saved.input, budget: scenario.budget },
            mix: scenario.mix,
            rejected: scenario.rejected,
            totals: scenario.totals,
            weeklyForecast: scenario.weeklyForecast,
            realityCheck: scenario.realityCheck,
          }
        : saved,
    [saved, scenario]
  );
  const staleNote = scenario
    ? `Written for the original ${inr(saved.input.budget)} plan; the slider does not rewrite it.`
    : undefined;
  const sliderRef = useRef<HTMLDivElement>(null);
  const [sliderOut, setSliderOut] = useState(false);
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSliderOut(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [grid]);
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
  const swatch = channelColors(useTheme());
  const calendar = plan.enrichment?.calendar;
  const localMarket = plan.enrichment?.localMarket;
  const showLocal = showLocalMarket(localMarket);
  const creators = plan.enrichment?.creators;
  const audience = plan.enrichment?.audience;
  const zeroRupee = plan.zeroRupee || [];
  const signals = Object.values(plan.enrichment || {}).filter((s): s is Signal<unknown> => Boolean(s));
  const reality = plan.realityCheck;
  const shapBy = new Map((scenario ? scenario.shap : plan.shap?.channels || []).map((c) => [c.channelId, c]));
  const shapNote = scenario
    ? `${plan.shap?.note ?? ""} Scores at ${inr(scenario.point.budget)}, the nearest precomputed budget.`.trim()
    : (plan.shap?.note ?? "");
  const placements = plan.placements || [];
  const kit = plan.launchKit?.channels.length ? plan.launchKit : undefined;

  const hasCheck = Boolean(reality || readiness);
  const hasStreet = Boolean((localMarket && showLocal) || creators);
  const hasWhoWhen = Boolean(audience || calendar);
  const sectionIds = [
    "cover",
    hasCheck ? "check" : null,
    plan.product ? "read" : null,
    hasStreet ? "street" : null,
    hasWhoWhen ? "who" : null,
    zeroRupee.length ? "free" : null,
    "mix",
    "charts",
    placements.length ? "post" : null,
    kit ? "kit" : null,
    "cuts",
    "ads",
    "outreach",
  ].filter((id): id is string => Boolean(id));
  const pad = (n: number) => String(n).padStart(2, "0");
  const chapter = (id: string) => ({ n: pad(sectionIds.indexOf(id) + 1), of: pad(sectionIds.length) });

  const cpa = plan.totals.estimatedCpa;
  const totalsR = totalsRangesOf(plan.totals, plan.mix.map((m) => m.forecast));
  const metaBacked = plan.mix.some((m) => m.forecast.ranges?.reachBand?.kind === "signal");
  const conv = (n: number) => n.toFixed(1);
  const kpis: { label: string; value: number; format: (n: number) => string; range?: ForecastRange; band?: string }[] = [
    { label: "Spend", value: plan.totals.budget, format: inr },
    {
      label: "Reach",
      value: plan.totals.reach,
      format: compactNumber,
      range: totalsR.reach,
      band: metaBacked ? "Meta reach backed by the Meta pool (±15%), rest ±30%" : "default band ±30%",
    },
    { label: "Clicks", value: plan.totals.clicks, format: compactNumber, range: totalsR.clicks, band: "default band ±30%" },
    { label: "Conversions", value: plan.totals.conversions, format: conv, range: totalsR.conversions, band: "default band ±30%" },
  ];

  return (
    <div className={`story-reel ${grid && sliderOut ? "pb-20" : ""}`}>
      <nav className="story-dots hidden xl:flex" aria-label="Sections">
        {[...sectionIds, "sources"].map((id, i) => (
          <a key={id} href={`#${id}`} className="story-dot" title={id}>
            {pad(i + 1)}
          </a>
        ))}
      </nav>

      <PlanHealth plan={plan} speed={speed} />

      {/* Hero: centered headline, subtitle and the key numbers. */}
      <StoryScene id="cover" className="story-chapter hero">
        <p className="story-bit kicker">A plan for {plan.input.city}</p>
        <h1 className="story-bit display">{name}</h1>
        <p className="story-bit sub">
          {inr(plan.input.budget)} a month · {plan.input.goal} · {plan.category}/{plan.priceTier} ·{" "}
          {plan.input.language}-speaking audience
        </p>
        <dl id="numbers" className="story-bit kpi-grid mt-10 scroll-mt-24">
          {kpis.map((k) => (
            <div key={k.label} className="card kpi">
              <dt>
                {k.label} <EstimateBadge />
              </dt>
              <dd className="num">
                <CountUp value={k.value} format={k.format} />
              </dd>
              {k.range ? (
                <dd className="num mt-2 text-sm text-fog" title={`${k.band}. Low and high sum the channel ranges.`}>
                  {rangeText(k.range, k.format)}
                  <span className="font-sans"> · {k.band}</span>
                </dd>
              ) : (
                <dd className="mt-2 text-sm text-fog">set by you</dd>
              )}
            </div>
          ))}
        </dl>
        <p className="story-bit mt-4 text-sm text-fog">
          Impressions <span className="num text-paper">{compactNumber(plan.totals.impressions)}</span> · CPA{" "}
          <span className="num text-paper">{cpa ? inr(cpa) : "—"}</span> · mix sums to{" "}
          <span className="num text-paper">{inr(mixSum)}</span>. {plan.disclaimer}
        </p>
        <div className="story-bit mt-8 flex flex-wrap justify-center gap-3">
          <button className="btn btn-primary" type="button" onClick={exportMd}>
            Export markdown
          </button>
          <button className="btn btn-ghost" type="button" onClick={copyMd}>
            {copied ? "Copied" : "Copy markdown"}
          </button>
          <Link className="btn btn-ghost" href={`/compare?a=${plan.id}`}>
            Compare
          </Link>
        </div>
        {grid ? (
          <div ref={sliderRef} className="story-bit">
            <BudgetSlider steps={steps} value={budget} base={grid.base} onChange={setBudget} transitions={moves} />
          </div>
        ) : null}
      </StoryScene>

      {grid && sliderOut ? (
        <div className="slider-sticky" role="region" aria-label="Budget slider">
          <BudgetSlider steps={steps} value={budget} base={grid.base} onChange={setBudget} transitions={moves} compact />
        </div>
      ) : null}

      {hasCheck ? (
        <StoryScene id="check" className="story-chapter">
          <SectionHead {...chapter("check")} title="Before the first rupee" />
          <div className="grid-2">
            {reality ? (
              <Cell id="reality" alone={!readiness}>
                <RealityCard rc={reality} hasFreeActions={zeroRupee.length > 0} />
              </Cell>
            ) : null}
            {readiness ? (
              <Cell id="ready" alone={!reality}>
                <ReadinessCard
                  signal={readiness}
                  domain={plan.site?.domain || plan.input.domain}
                  speed={speed.signal}
                  speedPending={speed.pending}
                  speedStartedAt={speed.startedAt}
                />
              </Cell>
            ) : null}
          </div>
        </StoryScene>
      ) : null}

      {plan.product ? (
        <StoryScene id="read" className="story-chapter">
          <SectionHead {...chapter("read")} title="We read the product" />
          <div className="card panel mx-auto max-w-3xl">
            <h3 className="story-bit display text-2xl sm:text-3xl">{plan.product.recognizedName}</h3>
            <p className="story-bit mt-2 text-sm text-fog">
              {plan.product.source} · {Math.round(plan.product.confidence * 100)}% confidence · {plan.product.tone}
            </p>
            <p className="story-bit mt-5 text-lg leading-relaxed text-paper">{plan.product.summary}</p>
            {(plan.product.differentiators || []).length ? (
              <div className="story-bit mt-6 flex flex-wrap gap-2">
                {plan.product.differentiators.map((d) => (
                  <span key={d} className="rounded-md border border-sand/30 bg-sand/10 px-3 py-1 text-sm text-sand">
                    {d}
                  </span>
                ))}
              </div>
            ) : null}
            {(plan.product.evidence || []).length ? (
              <ul className="story-bit mt-6 space-y-2 border-t border-rule pt-5 text-sm text-fog">
                {plan.product.evidence.map((e) => (
                  <li key={e}>↳ {e}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </StoryScene>
      ) : null}

      {hasStreet ? (
        <StoryScene id="street" className="story-chapter">
          <SectionHead {...chapter("street")} title="Your street" sub="Who already sells this near you, and who already talks to your buyers." />
          <div className="grid-2">
            {localMarket && showLocal ? (
              <Cell id="local" alone={!creators}>
                <LocalMarketCard signal={localMarket} city={plan.input.city} />
              </Cell>
            ) : null}
            {creators ? (
              <Cell id="voices" alone={!(localMarket && showLocal)}>
                <CreatorsCard signal={creators} city={plan.input.city} />
              </Cell>
            ) : null}
          </div>
        </StoryScene>
      ) : null}

      {hasWhoWhen ? (
        <StoryScene id="who" className="story-chapter">
          <SectionHead {...chapter("who")} title="Who and when" />
          <div className="grid-2">
            {audience ? (
              <Cell id="reach" alone={!calendar}>
                <AudienceCard signal={audience} city={plan.input.city} mix={plan.mix} />
              </Cell>
            ) : null}
            {calendar ? (
              <Cell id="timing" alone={!audience}>
                <TimingCard signal={calendar} city={plan.input.city} />
              </Cell>
            ) : null}
          </div>
        </StoryScene>
      ) : null}

      {zeroRupee.length ? (
        <StoryScene id="free" className="story-chapter">
          <SectionHead {...chapter("free")} title="Before you spend anything" note={staleNote} />
          <ZeroRupeeCard items={zeroRupee} signals={signals} />
        </StoryScene>
      ) : null}

      <StoryScene id="mix" className="story-chapter">
        <SectionHead
          {...chapter("mix")}
          title={`${plan.mix.length} channels, ${inr(mixSum)}`}
          sub="Each channel's share of the month, why it is here, and what the model weighed."
        />
        <div className="tiles">
          {plan.mix.map((row) => (
            <a key={row.channelId} href={`#ch-${row.channelId}`} className="story-bit card kpi hover:border-sand">
              <p className="flex items-center gap-2 text-paper">
                <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: swatch[row.channelId] }} />
                {row.name}
              </p>
              <p className="display num mt-3 text-4xl leading-none text-sand">
                <CountUp value={row.percent} format={(n) => pct(n, 0)} />
              </p>
              <p className="num mt-2 text-paper">{inr(row.budget)}</p>
              <p className="num mt-1 text-xs text-fog">
                {rangeText(rangesOf(row.forecast).clicks, compactNumber)} clicks
              </p>
            </a>
          ))}
        </div>
        <div className="grid-2 mt-6">
          {plan.mix.map((row) => (
            <article key={row.channelId} id={`ch-${row.channelId}`} className="story-bit card panel scroll-mt-24">
              <h3 className="flex items-center gap-2 text-xl text-paper">
                <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: swatch[row.channelId] }} />
                {row.name}
                <span className="num ml-auto text-base text-sand">
                  {pct(row.percent, 0)} · {inr(row.budget)}
                </span>
              </h3>
              <p className="mt-4 leading-relaxed text-fog">{row.explanation}</p>
              <ChannelRanges forecast={row.forecast} />
              <p className="num mt-3 text-sm text-fog">
                Score {row.score} · {compactNumber(row.forecast.impressions)} impr. · CTR {ctrPct(row.forecast.ctr)}
                {row.forecast.reachCapped ? " · reach capped to Meta pool" : ""}
              </p>
              {shapBy.get(row.channelId) ? (
                <ShapWaterfall shap={shapBy.get(row.channelId)!} note={shapNote} />
              ) : null}
            </article>
          ))}
        </div>
      </StoryScene>

      <StoryScene id="charts" className="story-chapter">
        <SectionHead {...chapter("charts")} title="Mix, reach, weeks" />
        <div className="grid-2">
          <div className="story-bit card panel">
            <h3 className="mb-2 text-center text-fog">Budget mix</h3>
            <MixPie plan={plan} />
          </div>
          <div className="story-bit card panel">
            <h3 className="mb-2 text-center text-fog">Weekly pacing</h3>
            <WeeklyLine plan={plan} />
          </div>
          <div className="story-bit card panel span-all">
            <h3 className="mb-2 text-center text-fog">Impressions by channel</h3>
            <ImpressionsBar plan={plan} />
          </div>
        </div>
      </StoryScene>

      {placements.length ? (
        <StoryScene id="post" className="story-chapter">
          <SectionHead
            {...chapter("post")}
            title="Where to actually post"
            sub="Not “Google”: these sites, apps and query themes. ESTIMATE inventory; we do not log into Google Ads."
            note={staleNote}
          />
          <div className="grid-3">
            {placements.map((p) => (
              <article key={`${p.channelId}-${p.target}`} className="story-bit card panel">
                <p className="text-sm text-sand">{KIND_LABEL[p.kind] || p.kind}</p>
                <h3 className="display mt-2 text-xl leading-tight">{p.name}</h3>
                <p className="num mt-3 break-words text-sm text-paper">{p.target}</p>
                <p className="mt-3 text-sm leading-relaxed text-fog">{p.why}</p>
                <p className="mt-3 text-sm">
                  Do this: <span className="text-paper">{p.action}</span>
                </p>
                <p className="mt-3 text-xs text-fog">
                  {p.channelName} · fit {p.fit}
                </p>
              </article>
            ))}
          </div>
        </StoryScene>
      ) : null}

      {kit ? (
        <StoryScene id="kit" className="story-chapter">
          <SectionHead {...chapter("kit")} title="Launch kit: what to set up on day one" note={staleNote} />
          <LaunchKit kit={kit} enrichment={plan.enrichment} />
        </StoryScene>
      ) : null}

      <StoryScene id="cuts" className="story-chapter">
        <SectionHead {...chapter("cuts")} title="What we cut" />
        <ul className="grid-2">
          {plan.rejected.map((r) => (
            <li key={r.channelId} className="story-bit card panel">
              <p className="display text-xl">
                {r.name} <span className="num text-base text-fog">({r.score})</span>
              </p>
              <p className="mt-2 text-paper">{r.rejectReason || "Not selected in the 2–5 mix"}</p>
              <p className="mt-2 text-sm text-fog">{r.reasons.slice(0, 3).join(" · ")}</p>
            </li>
          ))}
        </ul>
      </StoryScene>

      <StoryScene id="ads" className="story-chapter">
        <SectionHead {...chapter("ads")} title="Ad angles" note={staleNote} />
        <div className="grid-3">
          {plan.adAngles.map((a, i) => (
            <article key={`${a.headline}-${i}`} className="story-bit card panel flex flex-col">
              <h3 className="display text-2xl leading-tight">{a.headline}</h3>
              <p className="mt-4 leading-relaxed text-fog">{a.primaryText}</p>
              <p className="mt-auto pt-6">
                <span className="inline-block rounded-md bg-sand px-4 py-2 text-sm font-semibold text-on-sand">{a.cta}</span>
              </p>
              <p className="mt-3 text-xs text-fog">{a.channelHint}</p>
            </article>
          ))}
        </div>
      </StoryScene>

      <StoryScene id="outreach" className="story-chapter">
        <SectionHead {...chapter("outreach")} title="Outreach scripts" note={staleNote} />
        <div className="grid-2">
          {plan.outreach.map((o, i) => (
            <article key={`${o.channel}-${i}`} className="story-bit card panel">
              <p className="text-sm text-mint">{o.channel}</p>
              <h3 className="display mt-1 text-xl">{o.title}</h3>
              <pre className="mt-4 whitespace-pre-wrap font-sans leading-relaxed text-fog">{o.body}</pre>
            </article>
          ))}
        </div>
      </StoryScene>

      <DataSources plan={plan} />
    </div>
  );
}
