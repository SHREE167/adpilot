import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import type { FestivalHit, SeasonWindow, Signal } from "@/lib/types";

function dayLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function shiftIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

function uplift(m: number): string {
  return `+${Math.round((m - 1) * 100)}%`;
}

function leadLine(f: FestivalHit): string {
  if (f.daysAway < 0) return `${f.name} is on now: your ads are already in festival auctions.`;
  if (f.daysAway === 0) return `${f.name} is today.`;
  const when =
    f.daysAway <= 7
      ? "launch this week"
      : f.daysAway <= 14
        ? "launch next week"
        : `have creatives live by ${dayLabel(shiftIso(f.date, -7))}`;
  return `${f.name} on ${dayLabel(f.date)} (in ${f.daysAway} day${f.daysAway === 1 ? "" : "s"}): ${when}.`;
}

/** F3: the "Timing" chapter body. Static calendar, so everything here is ESTIMATE. */
export function TimingCard({ signal, city }: { signal: Signal<SeasonWindow>; city: string }) {
  const w = signal.data;
  if (signal.status !== "ok" || !w) {
    return (
      <div className="story-bit max-w-3xl">
        <h2 className="display text-5xl leading-[0.95] sm:text-7xl">Timing</h2>
        <p className="mt-8 flex flex-wrap items-center gap-3 text-xl text-fog">
          <ProvenanceBadge signal={signal} /> {signal.reason}
        </p>
      </div>
    );
  }

  const lead =
    w.inWindow.find((f) => f.relevant && f.daysAway >= 0) ||
    w.inWindow.find((f) => f.relevant) ||
    w.inWindow[0] ||
    null;
  const peak = Math.max(...w.weekMultipliers);
  const unverified = [...w.inWindow, ...w.upcoming].some((f) => !f.verified);
  const where = w.stateName || city;

  return (
    <>
      <h2 className="story-bit display max-w-[22ch] text-4xl leading-[1] sm:text-6xl">
        {lead ? leadLine(lead) : `A quiet month in ${where}.`}
      </h2>
      <p className="story-bit mt-8 flex max-w-3xl flex-wrap items-center gap-3 text-2xl leading-snug text-fog">
        {peak > 1 ? (
          <>
            Festival-week CPMs typically rise ({uplift(peak)}). <ProvenanceBadge estimate />
          </>
        ) : (
          <>No festival pressure in your 4 weeks: normal pacing.</>
        )}
      </p>
      {lead ? <p className="story-bit mt-4 max-w-3xl text-lg text-fog">{lead.advice}</p> : null}

      <ol className="story-bit mt-12 grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Plan weeks">
        {w.weekMultipliers.map((m, i) => {
          const hot = m > 1;
          return (
            <li
              key={i}
              className={`rounded-2xl border p-4 ${hot ? "border-sand/60 bg-sand/10" : "border-white/10 bg-white/[0.03]"}`}
            >
              <p className="text-sm text-fog">
                Week {i + 1} · {dayLabel(shiftIso(w.windowStart, i * 7))}
              </p>
              <p className={`num display mt-2 text-3xl ${hot ? "text-sand" : "text-fog/70"}`}>
                {hot ? uplift(m) : "normal"}
              </p>
              <p className="mt-1 min-h-[1.25rem] text-sm text-paper">{w.weekFestivals[i] || ""}</p>
            </li>
          );
        })}
      </ol>

      {w.upcoming.length ? (
        <div className="story-bit mt-12 max-w-3xl">
          <h3 className="text-xl">Coming up after this plan</h3>
          <ul className="mt-4 divide-y divide-white/10">
            {w.upcoming.slice(0, 4).map((f) => (
              <li key={`${f.name}-${f.date}`} className="grid grid-cols-[5.5rem_1fr] gap-3 py-3">
                <span className="num text-sand">{dayLabel(f.date)}</span>
                <span>
                  <span className="text-paper">{f.name}</span>{" "}
                  <span className="text-fog">· CPM {uplift(f.cpmMultiplier)}</span>
                  <span className="block text-sm text-fog">{f.advice}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="story-bit mt-10 max-w-3xl text-sm text-fog">
        {w.state ? `Festivals for ${where} plus national dates.` : `${signal.reason}.`}{" "}
        {unverified
          ? "Dates come from a static calendar and are not yet verified; uplifts are planning guesses."
          : "Uplifts are planning guesses."}
      </p>
    </>
  );
}
