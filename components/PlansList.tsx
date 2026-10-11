"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadPlans } from "@/app/actions";
import { listPlansLocal, mergeLists } from "@/lib/client-storage";
import { inr } from "@/lib/format";
import type { PlanListItem } from "@/lib/types";

export function PlansList({
  initial,
  source: initialSource,
}: {
  initial?: PlanListItem[];
  source?: string;
}) {
  const [plans, setPlans] = useState<PlanListItem[]>(initial ?? []);
  const [source, setSource] = useState<string>(initialSource || "localStorage");

  useEffect(() => {
    const local = listPlansLocal();
    setPlans(mergeLists(initial ?? [], local));
    loadPlans()
      .then((json) => {
        setPlans(mergeLists(json.plans, local));
        setSource(
          json.source === "postgres"
            ? "postgres + localStorage"
            : "memory + localStorage"
        );
      })
      .catch(() => setSource("localStorage"));
  }, [initial]);

  return (
    <div className="page space-y-6 py-12 sm:py-16">
      <header className="section-head !mb-2">
        <p className="kicker">Saved plans</p>
        <h1 className="display mt-2 text-3xl sm:text-4xl">Plans</h1>
        <p className="mx-auto mt-3 max-w-[60ch] text-sm text-fog">
          Source: {source}. Without POSTGRES_URL, this browser&apos;s localStorage
          is the durable copy.
        </p>
      </header>
      {plans.length === 0 ? (
        <div className="card mx-auto max-w-2xl p-8 text-center text-sm text-fog">
          No plans yet. <Link className="text-mint" href="/">Build one</Link> or
          load a sample fixture from the form.
        </div>
      ) : (
        <ul className="grid-2">
          {plans.map((p) => (
            <li key={p.id}>
              <Link
                href={`/plans/${p.id}`}
                className="card flex flex-col gap-1 p-4 transition hover:border-mint/50 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium">{p.product_name}</p>
                  <p className="text-xs text-fog">
                    {p.city} · {p.goal} · {p.category} · {p.domain || "no domain"}
                  </p>
                </div>
                <p className="num text-mint">{inr(p.budget)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
