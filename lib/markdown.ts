import { costBand } from "./creator-rates";
import { compactNumber, ctrPct, inr } from "./format";
import type { PlanResult } from "./types";

export function planToMarkdown(plan: PlanResult): string {
  const lines: string[] = [];
  lines.push(`# AdPilot plan — ${plan.input.product_name}`);
  lines.push("");
  lines.push(`> ${plan.disclaimer}`);
  lines.push("");
  lines.push(`- **ID:** ${plan.id}`);
  lines.push(`- **Created:** ${plan.createdAt}`);
  lines.push(`- **Domain:** ${plan.input.domain || "—"}`);
  lines.push(`- **City:** ${plan.input.city}`);
  lines.push(`- **Budget:** ${inr(plan.input.budget)} / month`);
  lines.push(`- **Audience:** ${plan.input.audience_age} — ${plan.input.audience_notes}`);
  lines.push(`- **Goal:** ${plan.input.goal}`);
  lines.push(`- **Language:** ${plan.input.language}`);
  lines.push(`- **Category / tier:** ${plan.category} / ${plan.priceTier}`);
  lines.push(`- **LLM:** ${plan.llmUsed ? plan.llmProvider : "templates (no key)"}`);
  lines.push(`- **Scorer:** ${plan.scorer ?? "xgboost"}`);
  lines.push("");
  if (plan.product) {
    lines.push("## Product recognition");
    lines.push("");
    lines.push(`- **Name:** ${plan.product.recognizedName}`);
    lines.push(`- **Source:** ${plan.product.source} (${Math.round(plan.product.confidence * 100)}%)`);
    lines.push(`- **Summary:** ${plan.product.summary}`);
    lines.push(`- **Differentiators:** ${plan.product.differentiators.join("; ")}`);
    lines.push("");
  }
  lines.push("## Site snapshot");
  lines.push("");
  if (plan.site.scraped) {
    lines.push(`- Title: ${plan.site.title}`);
    lines.push(`- Description: ${plan.site.description || "—"}`);
    lines.push(`- H1: ${plan.site.h1 || "—"}`);
  } else {
    lines.push(`- Not scraped (${plan.site.scrapeError || "skipped"}). Used product_name.`);
  }
  lines.push("");
  const rc = plan.realityCheck;
  if (rc) {
    const label = { healthy: "Healthy", tight: "Tight", likely_loss: "Likely loss" }[rc.verdict];
    lines.push("## Reality check (ESTIMATE)");
    lines.push("");
    lines.push(`- **Verdict:** ${label}`);
    lines.push(`- ${rc.headline} ${rc.detail}`);
    lines.push(`- Price ${inr(rc.price)} × margin ${rc.marginPct}% = ${inr(rc.profitPerSale)} profit per sale; ${compactNumber(rc.clicks)} forecast clicks.`);
    lines.push(`- ${rc.advice}`);
    lines.push("");
  }
  const au = plan.enrichment?.audience;
  if (au?.status === "ok" && au.data) {
    const a = au.data;
    lines.push(`## Who you can reach (Meta${au.mock ? ", MOCK" : ""})`);
    lines.push("");
    lines.push(`- **Pool:** ${compactNumber(a.lower)}-${compactNumber(a.upper)} people (${a.city.name}, age ${a.ageMin}-${a.ageMax}${a.interests.length ? `, ${a.interests.map((i) => i.name).join(", ")}` : ""})`);
    if (a.interestsNote) lines.push(`- ${a.interestsNote}`);
    lines.push("- **Targeting spec:**");
    lines.push("");
    lines.push("```json");
    lines.push(JSON.stringify(a.targetingSpec, null, 2));
    lines.push("```");
    lines.push("");
  }
  const cr = plan.enrichment?.creators;
  if (cr?.status === "ok" && cr.data?.picks.length) {
    lines.push(`## Local voices (YouTube${cr.mock ? ", MOCK" : ""})`);
    lines.push("");
    lines.push(`Search "${cr.data.query}": ${cr.data.inBand} of ${cr.data.found} channels have 2k-200k subscribers.`);
    lines.push("");
    for (const c of cr.data.picks) {
      const band = costBand(c.subscribers);
      const cost = band ? ` Collab ${inr(band.low)}-${inr(band.high)} per video (ESTIMATE).` : "";
      lines.push(`- [${c.title}](${c.url}): ${c.why.join(". ")}.${cost}`);
    }
    lines.push("");
  }
  lines.push("## Forecast totals (ESTIMATE)");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | --- |`);
  lines.push(`| Spend | ${inr(plan.totals.budget)} |`);
  lines.push(`| Impressions | ${compactNumber(plan.totals.impressions)} |`);
  lines.push(`| Clicks | ${compactNumber(plan.totals.clicks)} |`);
  lines.push(`| Reach | ${compactNumber(plan.totals.reach)} |`);
  lines.push(`| Conversions | ${plan.totals.conversions} |`);
  lines.push(`| CPA | ${plan.totals.estimatedCpa ? inr(plan.totals.estimatedCpa) : "—"} |`);
  lines.push(`| ROAS | ${plan.totals.estimatedRoas ?? "—"} |`);
  lines.push("");
  lines.push("## Channel mix");
  lines.push("");
  lines.push(`| Channel | Score | Budget | % | Impr. | Clicks | CTR |`);
  lines.push(`| --- | --- | --- | --- | --- | --- | --- |`);
  for (const row of plan.mix) {
    lines.push(
      `| ${row.name} | ${row.score} | ${inr(row.budget)} | ${row.percent.toFixed(1)}% | ${compactNumber(row.forecast.impressions)} | ${compactNumber(row.forecast.clicks)} | ${ctrPct(row.forecast.ctr)} |`
    );
  }
  lines.push("");
  for (const row of plan.mix) {
    lines.push(`### ${row.name}`);
    lines.push("");
    lines.push(row.explanation);
    lines.push("");
  }
  if (plan.placements?.length) {
    lines.push("## Where to post (sites, Google apps, inventory)");
    lines.push("");
    lines.push("Not generic platforms. ESTIMATE placements — no Google Ads login.");
    lines.push("");
    for (const p of plan.placements) {
      lines.push(`- **${p.name}** (${p.kind}) — \`${p.target}\``);
      lines.push(`  - ${p.action}`);
      lines.push(`  - ${p.why}`);
    }
    lines.push("");
  }
  lines.push("## Rejected / unused channels");
  lines.push("");
  for (const r of plan.rejected) {
    lines.push(`- **${r.name}** (score ${r.score})${r.rejectReason ? ` — ${r.rejectReason}` : ""}`);
  }
  lines.push("");
  lines.push("## Ad angles (3)");
  lines.push("");
  plan.adAngles.forEach((a, i) => {
    lines.push(`### ${i + 1}. ${a.headline}`);
    lines.push("");
    lines.push(a.primaryText);
    lines.push("");
    lines.push(`CTA: **${a.cta}** · ${a.channelHint}`);
    lines.push("");
  });
  lines.push("## Outreach scripts (8)");
  lines.push("");
  plan.outreach.forEach((o, i) => {
    lines.push(`### ${i + 1}. ${o.channel} — ${o.title}`);
    lines.push("");
    lines.push("```");
    lines.push(o.body);
    lines.push("```");
    lines.push("");
  });
  lines.push("## Weekly pacing (ESTIMATE)");
  lines.push("");
  for (const w of plan.weeklyForecast) {
    lines.push(`- ${w.label}: spend ${inr(w.spend)}, ${compactNumber(w.impressions)} impr., ${compactNumber(w.clicks)} clicks`);
  }
  lines.push("");
  lines.push("---");
  lines.push(plan.disclaimer);
  return lines.join("\n");
}
