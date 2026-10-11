"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createPlan } from "@/app/actions";
import { StoryScene } from "@/components/Motion";
import { PipelineProgress } from "@/components/PipelineProgress";
import { savePlanLocal } from "@/lib/client-storage";
import { SAMPLE_FIXTURES } from "@/lib/fixtures";
import {
  applyStepEvent,
  closeSteps,
  initialSteps,
  readPlanStream,
  type StepRow,
} from "@/lib/plan-progress";
import { GOALS, LANGUAGES, type PlanInput, type PlanResult } from "@/lib/types";

const STEPS = [
  "Read the live page (title, H1, JSON-LD)",
  "Recognize the product (heuristic + LLM)",
  "Score channels with trained XGBoost",
  "Allocate 2–5 channels (sum = budget)",
  "Look up Google sites / apps / exact inventory",
  "Forecast from the rate card",
  "Write product-specific ads + outreach",
  "Return PlanResult",
];

const empty: PlanInput = {
  domain: "",
  product_name: "",
  budget: 10000,
  city: "",
  audience_age: "18-34",
  audience_notes: "",
  goal: "sales",
  language: "English",
};

export function PlanForm() {
  const router = useRouter();
  const [form, setForm] = useState<PlanInput>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<StepRow[] | null>(null);
  const [clockBase, setClockBase] = useState<number | null>(null);
  const [totalMs, setTotalMs] = useState<number | undefined>(undefined);
  const [note, setNote] = useState<string | null>(null);

  // F8: optional break-even pair, kept as text so both can be blank.
  const [price, setPrice] = useState("");
  const [margin, setMargin] = useState("");
  const priceError =
    price.trim() && !(Number(price) > 0) ? "Enter a price above ₹0." : null;
  const marginError =
    margin.trim() && !(Number(margin) >= 1 && Number(margin) <= 95)
      ? "Enter a margin between 1% and 95%."
      : null;
  const halfFilled = Boolean(price.trim()) !== Boolean(margin.trim());

  const canSubmit = useMemo(
    () =>
      form.product_name.trim() &&
      form.city.trim() &&
      form.budget >= 500 &&
      !priceError &&
      !marginError,
    [form, priceError, marginError]
  );

  /** The brief as sent: the pair only when both are filled. */
  function brief(): PlanInput {
    const rest: PlanInput = { ...form };
    delete rest.price;
    delete rest.margin;
    if (!price.trim() || !margin.trim()) return rest;
    return { ...rest, price: Number(price), margin: Number(margin) };
  }

  function loadSample(input: PlanInput) {
    setForm(input);
    setPrice(input.price ? String(input.price) : "");
    setMargin(input.margin ? String(input.margin) : "");
  }

  function set<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function finish(plan: PlanResult) {
    setTotalMs(plan.trace?.totalMs ?? plan.agentMs);
    savePlanLocal(plan);
    router.push(`/plans/${plan.id}`);
  }

  function fail(message: string) {
    setRows((r) => (r ? closeSteps(r, true) : r));
    setError(message);
    setBusy(false);
  }

  /** No stream at all (old proxy, network): the Server Action, honestly labelled. */
  async function runWithoutProgress() {
    setNote("Live progress is unavailable on this connection. Waiting for the full plan…");
    const result = await createPlan(brief());
    if ("error" in result) return fail(result.error);
    finish(result.plan);
  }

  async function run() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    setTotalMs(undefined);
    setClockBase(null);
    setRows(initialSteps());

    let events = 0;
    let plan: PlanResult | null = null;
    let streamError: string | null = null;
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brief()),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        if (body?.message) return fail(body.message);
        throw new Error(`HTTP ${res.status}`);
      }
      await readPlanStream(res.body, (ev) => {
        events++;
        if (ev.type === "step") {
          setClockBase((b) => b ?? performance.now() - ev.atMs);
          setRows((r) => applyStepEvent(r ?? initialSteps(), ev));
        } else if (ev.type === "done") {
          plan = ev.plan;
        } else {
          streamError = ev.message;
        }
      });
    } catch (err) {
      if (events === 0) {
        try {
          return await runWithoutProgress();
        } catch (err2) {
          return fail(err2 instanceof Error ? err2.message : "Could not build the plan");
        }
      }
      return fail(
        `Connection lost while the plan was building (${err instanceof Error ? err.message : "network"}). Try again.`
      );
    }
    if (plan) return finish(plan);
    fail(streamError || "The server closed the connection before the plan finished. Try again.");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void run();
  }

  return (
    <div>
      <StoryScene className="story-chapter">
        <p className="story-bit kicker">AdPilot · India</p>
        <h1 className="story-bit display mt-6 max-w-[12ch] text-6xl leading-[0.88] sm:text-8xl lg:text-9xl">
          The plan is a story.
          <span className="block text-sand">You scroll it.</span>
        </h1>
        <p className="story-bit mt-10 max-w-2xl text-2xl leading-snug text-fog">
          We read the product. XGBoost scores twelve channels. The rate card
          turns rupees into ESTIMATE reach. Then you walk the mix like chapters.
        </p>
        <p className="story-bit scroll-cue mt-20 text-sm uppercase tracking-[0.35em] text-sand">
          Scroll to brief ↓
        </p>
      </StoryScene>

      <form onSubmit={onSubmit} className="story-chapter mx-auto max-w-5xl">
        <p className="kicker">New media plan</p>
        <h2 className="display mt-4 text-5xl leading-[0.95] sm:text-7xl">
          Brief the agent.
        </h2>
        <p className="mt-6 max-w-xl text-xl leading-relaxed text-fog">
          No Meta. No Google. No live buying. Paste a domain if you have one.
        </p>

        <div className="mt-10 flex flex-wrap gap-2">
          {SAMPLE_FIXTURES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn btn-ghost text-xs"
              onClick={() => loadSample(s.input)}
            >
              Load {s.label}
            </button>
          ))}
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <div className="field sm:col-span-2">
            <label htmlFor="product_name">Product name</label>
            <input
              id="product_name"
              required
              value={form.product_name}
              onChange={(e) => set("product_name", e.target.value)}
              placeholder="Campus Crunch masala peanuts"
            />
          </div>
          <div className="field">
            <label htmlFor="domain">Domain (optional)</label>
            <input
              id="domain"
              value={form.domain}
              onChange={(e) => set("domain", e.target.value)}
              placeholder="yourbrand.in"
            />
          </div>
          <div className="field">
            <label htmlFor="budget">Monthly budget (INR)</label>
            <input
              id="budget"
              type="number"
              min={500}
              step={100}
              required
              value={form.budget}
              onChange={(e) => set("budget", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="city">City</label>
            <input
              id="city"
              required
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="Chennai"
            />
          </div>
          <div className="field">
            <label htmlFor="audience_age">Audience age</label>
            <input
              id="audience_age"
              value={form.audience_age}
              onChange={(e) => set("audience_age", e.target.value)}
              placeholder="18-24"
            />
          </div>
          <div className="field">
            <label htmlFor="goal">Goal</label>
            <select
              id="goal"
              value={form.goal}
              onChange={(e) => set("goal", e.target.value)}
            >
              {GOALS.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="language">Audience language</label>
            <select
              id="language"
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="field sm:col-span-2">
            <label htmlFor="audience_notes">Audience notes</label>
            <textarea
              id="audience_notes"
              rows={5}
              value={form.audience_notes}
              onChange={(e) => set("audience_notes", e.target.value)}
              placeholder="Students in hostels, professional buyers, Tamil-first, etc."
            />
          </div>
        </div>

        <fieldset className="mt-10 rounded-2xl border border-rule p-5 sm:p-6">
          <legend className="px-2 text-lg text-paper">Break-even check (optional)</legend>
          <p className="max-w-xl text-fog">
            Add what one sale earns you and we will tell you how many sales this budget needs to
            pay for itself.
          </p>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="price">Price of one sale (₹)</label>
              <input
                id="price"
                type="number"
                inputMode="decimal"
                min={1}
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="199"
                aria-invalid={Boolean(priceError)}
                aria-describedby={priceError ? "price-error" : undefined}
              />
              {priceError ? (
                <p id="price-error" className="mt-2 text-sm text-danger">
                  {priceError}
                </p>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="margin">Your margin (%)</label>
              <input
                id="margin"
                type="number"
                inputMode="decimal"
                min={1}
                max={95}
                step="any"
                value={margin}
                onChange={(e) => setMargin(e.target.value)}
                placeholder="30"
                aria-invalid={Boolean(marginError)}
                aria-describedby={marginError ? "margin-error" : undefined}
              />
              {marginError ? (
                <p id="margin-error" className="mt-2 text-sm text-danger">
                  {marginError}
                </p>
              ) : null}
            </div>
          </div>
          {halfFilled && !priceError && !marginError ? (
            <p className="mt-4 text-sm text-fog" role="status">
              Fill in both to get the break-even check. With one, the plan skips it.
            </p>
          ) : null}
        </fieldset>


        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button className="btn btn-primary text-lg" disabled={!canSubmit || busy} type="submit">
            {busy ? "Running agent…" : "Build the story"}
          </button>
          <span className="text-fog">
            Agent on the server. Keys never ship to the browser.
          </span>
        </div>

        {error ? (
          <div
            role="alert"
            className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-danger/40 bg-danger/10 px-5 py-4"
          >
            <p className="text-danger">
              <span className="font-bold">The plan could not be built.</span> {error}
            </p>
            <button type="button" className="btn btn-ghost text-sm" onClick={() => void run()}>
              Try again
            </button>
          </div>
        ) : null}
        {note ? (
          <p className="mt-6 text-fog" role="status">
            {note}
          </p>
        ) : null}
        {rows ? (
          <div className="mt-8 max-w-2xl">
            <PipelineProgress rows={rows} clockBase={clockBase} active={busy} totalMs={totalMs} />
          </div>
        ) : null}
      </form>

      <StoryScene className="story-chapter mx-auto max-w-5xl">
        <p className="story-bit kicker">Agent steps</p>
        <h2 className="story-bit display mt-4 text-5xl sm:text-7xl">Eight beats. Under 15s.</h2>
        <ol className="mt-16 space-y-8">
          {STEPS.map((label, i) => (
            <li key={label} className="story-bit flex gap-5 text-2xl">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-rule text-base font-bold text-fog">
                {i + 1}
              </span>
              <span className="text-fog">{label}</span>
            </li>
          ))}
        </ol>
      </StoryScene>
    </div>
  );
}
