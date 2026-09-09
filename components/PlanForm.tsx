"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createPlan } from "@/app/actions";
import { StoryScene } from "@/components/Motion";
import { savePlanLocal } from "@/lib/client-storage";
import { SAMPLE_FIXTURES } from "@/lib/fixtures";
import { GOALS, LANGUAGES, type PlanInput } from "@/lib/types";

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
  const [step, setStep] = useState(0);

  const canSubmit = useMemo(
    () => form.product_name.trim() && form.city.trim() && form.budget >= 500,
    [form]
  );

  function set<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    setStep(0);
    const tick = window.setInterval(() => {
      setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
    }, 700);
    try {
      const result = await createPlan(form);
      if ("error" in result) {
        throw new Error(result.error);
      }
      savePlanLocal(result.plan);
      router.push(`/plans/${result.plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the plan");
      setBusy(false);
    } finally {
      window.clearInterval(tick);
    }
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
              onClick={() => setForm(s.input)}
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
            <label htmlFor="language">Language</label>
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

        {error ? (
          <p className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <button className="btn btn-primary text-lg" disabled={!canSubmit || busy} type="submit">
            {busy ? "Running agent…" : "Build the story"}
          </button>
          <span className="text-fog">
            Agent on the server. Keys never ship to the browser.
          </span>
        </div>
      </form>

      <StoryScene className="story-chapter mx-auto max-w-5xl">
        <p className="story-bit kicker">Agent steps</p>
        <h2 className="story-bit display mt-4 text-5xl sm:text-7xl">Eight beats. Under 15s.</h2>
        <ol className="mt-16 space-y-8">
          {STEPS.map((label, i) => {
            const on = busy && i <= step;
            return (
              <li key={label} className="story-bit flex gap-5 text-2xl">
                <span
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-bold ${
                    on ? "bg-sand text-[#2a1608]" : "border border-white/20 text-fog"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={on ? "text-paper" : "text-fog"}>{label}</span>
              </li>
            );
          })}
        </ol>
      </StoryScene>
    </div>
  );
}
