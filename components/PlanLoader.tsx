"use client";

import { useEffect, useState } from "react";
import { loadPlan } from "@/app/actions";
import { Dashboard } from "@/components/Dashboard";
import { getPlanLocal, savePlanLocal } from "@/lib/client-storage";
import type { PlanResult } from "@/lib/types";

export function PlanLoader({
  id,
  initial,
}: {
  id: string;
  initial?: PlanResult | null;
}) {
  const [plan, setPlan] = useState<PlanResult | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const local = getPlanLocal(id);
      if (initial) {
        savePlanLocal(initial);
        if (!cancelled) setPlan(initial);
        return;
      }
      if (local && !cancelled) setPlan(local);
      const { plan: serverPlan } = await loadPlan(id);
      if (cancelled) return;
      if (serverPlan) {
        savePlanLocal(serverPlan);
        setPlan(serverPlan);
        return;
      }
      if (!local) {
        setError(
          "Plan not found. It may only exist in another browser, or the serverless instance forgot it. Enable Postgres on Vercel to persist."
        );
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, initial]);

  if (error && !plan) {
    return (
      <div className="page py-24">
        <div className="card mx-auto max-w-xl p-8 text-center text-sm text-fog">
          <p className="text-danger">{error}</p>
        </div>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="page py-24">
        <div className="card mx-auto max-w-xl p-8 text-center text-sm text-fog">Loading plan…</div>
      </div>
    );
  }
  return <Dashboard plan={plan} />;
}
