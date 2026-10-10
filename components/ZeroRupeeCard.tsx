import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import type { Signal, ZeroRupeeItem } from "@/lib/types";

/**
 * F10: "Before you spend anything", above the paid mix. Items are advice, not
 * estimates; any number quoted from a source carries that source's badge.
 */
export function ZeroRupeeCard({
  items,
  signals,
}: {
  items: ZeroRupeeItem[];
  signals: Signal<unknown>[];
}) {
  const bySource = new Map(signals.map((s) => [s.source, s]));

  return (
    <>
      <h2 className="story-bit display max-w-[16ch] text-5xl leading-[0.95] sm:text-7xl">
        Do these <span className="text-mint">free</span> first.
      </h2>
      <p className="story-bit mt-6 max-w-2xl text-xl text-fog">
        {items.length === 1 ? "One move" : `${items.length} moves`} that cost ₹0 and make every paid
        rupee after them work harder.
      </p>

      <ol className="mt-12 grid max-w-3xl gap-5">
        {items.map((item, i) => (
          <li key={item.id} className="story-bit card p-6 sm:p-8">
            <div className="grid grid-cols-[2.5rem_1fr] gap-x-3">
              <span className="num display text-3xl leading-none text-sand" aria-hidden>
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="display text-2xl leading-tight sm:text-3xl">{item.title}</h3>
                <p className="mt-3 text-fog">{item.why}</p>
                {item.sources.length ? (
                  <p className="mt-3 flex flex-wrap gap-2">
                    {item.sources.map((src) => (
                      <ProvenanceBadge key={src} signal={bySource.get(src)} />
                    ))}
                  </p>
                ) : null}
                <ul className="mt-5 space-y-2 border-t border-rule pt-4 text-sm">
                  {item.steps.map((s) => (
                    <li key={s} className="grid grid-cols-[1rem_1fr] gap-2 text-paper">
                      <span aria-hidden className="text-mint">
                        ↳
                      </span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
