import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { STATUS_LABEL, sourceLabel } from "@/lib/sources";
import type { PlanResult, Signal } from "@/lib/types";

const STATUS_TONE: Record<Signal<unknown>["status"], string> = {
  ok: "text-mint",
  skipped: "text-fog",
  timeout: "text-sand",
  error: "text-danger",
};

/** "Data sources" footer: every signal with status and ms, plus the agent trace. */
export function DataSources({ plan }: { plan: PlanResult }) {
  if (!plan.planVersion || !plan.enrichment) {
    return (
      <section className="page pb-16 pt-8">
        <div className="card p-6 text-sm text-fog sm:p-8">
          <h2 className="display text-2xl text-paper">Data sources</h2>
          <p className="mt-3 max-w-2xl">
            This plan was made before AdPilot v2 data sources existed. Every number on it is
            an ESTIMATE from the rate card and the XGBoost model.
          </p>
        </div>
      </section>
    );
  }

  const signals = Object.values(plan.enrichment).filter(
    (s): s is Signal<unknown> => Boolean(s)
  );
  const spans = plan.trace?.spans ?? [];

  return (
    <section id="sources" className="page pb-16 pt-8">
      <div className="card p-6 sm:p-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="display text-2xl sm:text-3xl">Data sources</h2>
          {plan.trace ? (
            <p className="num text-sm text-fog">
              built in {plan.trace.totalMs} ms · {spans.length} steps
            </p>
          ) : null}
        </div>

        {signals.length ? (
          <ul className="mt-6 divide-y divide-rule">
            {signals.map((s) => (
              <li
                key={s.source}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[12rem_1fr_auto]"
              >
                <span className="text-paper">{sourceLabel(s.source)}</span>
                <span className="order-3 col-span-2 text-sm text-fog sm:order-none sm:col-span-1">
                  <span className={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</span>
                  {s.cached ? " · cached" : ""}
                  {s.reason ? ` · ${s.reason}` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <span className="num text-xs text-fog">{s.ms} ms</span>
                  <ProvenanceBadge signal={s} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-fog">No external sources ran for this plan.</p>
        )}

        {spans.length ? (
          <details className="group mt-6 border-t border-rule pt-4">
            <summary className="cursor-pointer text-sm text-sand outline-none focus-visible:underline">
              How this plan was made
            </summary>
            <ol className="mt-4 space-y-2">
              {spans.map((sp, i) => (
                <li
                  key={`${sp.name}-${i}`}
                  className={`grid grid-cols-[1fr_auto] gap-3 text-sm ${sp.parent ? "pl-5" : ""}`}
                >
                  <span>
                    <span className="text-paper">{sp.name}</span>{" "}
                    <span className={STATUS_TONE[sp.status]}>{STATUS_LABEL[sp.status]}</span>
                    {sp.meta ? (
                      <span className="text-fog">
                        {" "}
                        ·{" "}
                        {Object.entries(sp.meta)
                          .map(([k, v]) => `${k} ${v}`)
                          .join(", ")}
                      </span>
                    ) : null}
                    {sp.error ? <span className="text-danger"> · {sp.error}</span> : null}
                  </span>
                  <span className="num text-xs text-fog">
                    +{sp.startMs} · {sp.ms} ms
                  </span>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </section>
  );
}
