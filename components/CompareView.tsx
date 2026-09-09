"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { loadPlan, loadPlans } from "@/app/actions";
import { EstimateBadge } from "@/components/EstimateBadge";
import { getPlanLocal, listPlansLocal, savePlanLocal } from "@/lib/client-storage";
import { compactNumber, inr, pct } from "@/lib/format";
import type { PlanListItem, PlanResult } from "@/lib/types";

async function resolvePlan(id: string): Promise<PlanResult | null> {
  const local = getPlanLocal(id);
  const { plan } = await loadPlan(id);
  if (plan) {
    savePlanLocal(plan);
    return plan;
  }
  return local;
}

function Side({ plan }: { plan: PlanResult | null }) {
  if (!plan) {
    return <div className="card p-6 text-sm text-fog">Select a plan.</div>;
  }
  return (
    <div className="card space-y-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="kicker">{plan.input.city}</p>
          <h2 className="mt-1 text-xl font-semibold">{plan.input.product_name}</h2>
          <p className="text-xs text-fog">
            {plan.category} / {plan.priceTier} · {plan.input.goal}
          </p>
        </div>
        <EstimateBadge />
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-fog">Budget</dt>
          <dd className="num">{inr(plan.totals.budget)}</dd>
        </div>
        <div>
          <dt className="text-fog">Impressions</dt>
          <dd className="num">{compactNumber(plan.totals.impressions)}</dd>
        </div>
        <div>
          <dt className="text-fog">Clicks</dt>
          <dd className="num">{compactNumber(plan.totals.clicks)}</dd>
        </div>
        <div>
          <dt className="text-fog">CPA</dt>
          <dd className="num">{plan.totals.estimatedCpa ? inr(plan.totals.estimatedCpa) : "—"}</dd>
        </div>
      </dl>
      <ul className="space-y-2 text-sm">
        {plan.mix.map((m) => (
          <li key={m.channelId} className="flex items-center justify-between gap-2">
            <span>{m.name}</span>
            <span className="num text-fog">
              {inr(m.budget)} · {pct(m.percent)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CompareView() {
  const params = useSearchParams();
  const router = useRouter();
  const [options, setOptions] = useState<PlanListItem[]>([]);
  const [a, setA] = useState<PlanResult | null>(null);
  const [b, setB] = useState<PlanResult | null>(null);
  const aId = params.get("a") || "";
  const bId = params.get("b") || "";

  useEffect(() => {
    setOptions(listPlansLocal());
    loadPlans()
      .then((json) => {
        const map = new Map<string, PlanListItem>();
        for (const p of [...listPlansLocal(), ...json.plans]) map.set(p.id, p);
        setOptions([...map.values()]);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (aId) {
        const plan = await resolvePlan(aId);
        if (!cancelled) setA(plan);
      } else setA(null);
      if (bId) {
        const plan = await resolvePlan(bId);
        if (!cancelled) setB(plan);
      } else setB(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [aId, bId]);

  function pick(side: "a" | "b", id: string) {
    const next = new URLSearchParams(params.toString());
    if (id) next.set(side, id);
    else next.delete(side);
    router.replace(`/compare?${next.toString()}`);
  }

  const overlap = useMemo(() => {
    if (!a || !b) return [];
    const ids = new Set(a.mix.map((m) => m.channelId));
    return b.mix.filter((m) => ids.has(m.channelId)).map((m) => m.name);
  }, [a, b]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-6 py-16 sm:px-12">
      <header>
        <p className="kicker">Side by side</p>
        <h1 className="mt-2 text-3xl font-semibold">Compare plans</h1>
        <p className="mt-2 text-sm text-fog">
          Query: <span className="num">/compare?a=&amp;b=</span>. Figures remain ESTIMATE.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["a", "b"] as const).map((side) => (
          <label key={side} className="field">
            <span>Plan {side.toUpperCase()}</span>
            <select
              value={side === "a" ? aId : bId}
              onChange={(e) => pick(side, e.target.value)}
            >
              <option value="">Choose…</option>
              {options.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.product_name} · {inr(p.budget)}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {overlap.length ? (
        <p className="text-xs text-fog">Shared channels: {overlap.join(", ")}</p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Side plan={a} />
        <Side plan={b} />
      </div>
    </div>
  );
}
