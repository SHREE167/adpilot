"use client";

import { useState } from "react";
import { saveRateCard } from "@/app/actions";
import { EstimateBadge } from "@/components/EstimateBadge";
import { ctrPct, inr } from "@/lib/format";
import type { RateCard } from "@/lib/types";

export function RateCardEditor({
  initial,
  storage: initialStorage,
}: {
  initial: RateCard;
  storage: string;
}) {
  const [card, setCard] = useState<RateCard>(initial);
  const [storage, setStorage] = useState<string>(initialStorage);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function update(i: number, key: "cpm" | "cpc" | "ctr", value: number) {
    setCard((c) => {
      if (!c) return c;
      const channels = c.channels.map((ch, idx) =>
        idx === i ? { ...ch, [key]: value } : ch
      );
      return { ...c, channels };
    });
  }

  async function save() {
    if (!card) return;
    setError(null);
    setMessage(null);
    const json = await saveRateCard(card);
    if ("error" in json) {
      setError(json.error);
      return;
    }
    setCard(json.rateCard);
    setStorage(json.storage);
    setMessage(
      json.storage === "postgres"
        ? "Saved to Postgres."
        : "Saved in server memory for this instance. Add POSTGRES_URL to persist."
    );
  }

  return (
    <div className="page space-y-6 py-12 sm:py-16">
      <header className="section-head !mb-2">
        <div>
          <p className="kicker">India 2026</p>
          <h1 className="display mt-2 text-3xl sm:text-4xl">Rate card</h1>
          <p className="mx-auto mt-3 max-w-[60ch] text-sm text-fog">
            CPM / CPC / CTR used by the forecast. These are planning ESTIMATES,
            not live auction prices. Storage: {storage || "…"}.
          </p>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2">
          <EstimateBadge />
          <button className="btn btn-primary" type="button" onClick={save}>
            Save rate card
          </button>
        </div>
      </header>
      {message ? <p className="text-center text-sm text-mint">{message}</p> : null}
      {error ? <p className="text-center text-sm text-danger">{error}</p> : null}
      <div className="card mx-auto max-w-[960px] overflow-x-auto p-4 sm:p-6">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs font-semibold text-fog">
            <tr>
              <th className="pb-2 pr-3">Channel</th>
              <th className="pb-2 pr-3">CPM (₹)</th>
              <th className="pb-2 pr-3">CPC (₹)</th>
              <th className="pb-2 pr-3">CTR</th>
              <th className="pb-2">CTR %</th>
            </tr>
          </thead>
          <tbody>
            {card.channels.map((ch, i) => (
              <tr key={ch.id} className="border-t border-rule">
                <td className="py-2 pr-3">{ch.name}</td>
                <td className="py-2 pr-3">
                  <input
                    className="num w-24 rounded-md border border-rule-strong bg-ink px-2 py-1"
                    type="number"
                    min={1}
                    value={ch.cpm}
                    onChange={(e) => update(i, "cpm", Number(e.target.value))}
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    className="num w-24 rounded-md border border-rule-strong bg-ink px-2 py-1"
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={ch.cpc}
                    onChange={(e) => update(i, "cpc", Number(e.target.value))}
                  />
                </td>
                <td className="py-2 pr-3">
                  <input
                    className="num w-24 rounded-md border border-rule-strong bg-ink px-2 py-1"
                    type="number"
                    min={0.0001}
                    max={0.99}
                    step={0.001}
                    value={ch.ctr}
                    onChange={(e) => update(i, "ctr", Number(e.target.value))}
                  />
                </td>
                <td className="num py-2 text-fog">{ctrPct(ch.ctr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-fog">
          Example: Google Search CPM {inr(180)} means ₹180 per 1,000 impressions
          (ESTIMATE).
        </p>
      </div>
    </div>
  );
}
