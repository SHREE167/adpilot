"use client";

import { useEffect, useState } from "react";
import type { StepRow, StepStatus } from "@/lib/plan-progress";

const GLYPH: Record<StepStatus, { mark: string; tone: string; word: string }> = {
  pending: { mark: "", tone: "border-rule text-fog", word: "waiting" },
  running: { mark: "", tone: "border-sand text-sand", word: "running" },
  ok: { mark: "✓", tone: "border-mint/50 bg-mint/10 text-mint", word: "done" },
  skipped: { mark: "–", tone: "border-rule text-fog", word: "skipped" },
  timeout: { mark: "!", tone: "border-sand/60 bg-sand/10 text-sand", word: "timed out" },
  error: { mark: "✕", tone: "border-danger/50 bg-danger/10 text-danger", word: "failed" },
};

function secs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/**
 * Live pipeline progress, driven only by streamed server events. Elapsed time
 * for a running step is real wall-clock since the server reported it started.
 */
export function PipelineProgress({
  rows,
  clockBase,
  active,
  totalMs,
}: {
  rows: StepRow[];
  /** performance.now() minus the server's atMs of the first event (aligns the clocks). */
  clockBase: number | null;
  active: boolean;
  totalMs?: number;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    setNow(performance.now());
    const t = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(t);
  }, [active]);

  const done = rows.filter((r) => r.status !== "pending" && r.status !== "running").length;
  const running = rows.filter((r) => r.status === "running");
  const announce = running.length ? `${running.map((r) => r.label).join(", ")} running` : "";

  return (
    <div className="card p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="display text-2xl">Agent progress</h3>
        <p className="num text-sm text-fog">
          {done}/{rows.length} steps
          {totalMs !== undefined ? ` · ${secs(totalMs)} total` : ""}
        </p>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <ol className="mt-5 space-y-1.5">
        {rows.map((r) => {
          const g = GLYPH[r.status];
          const elapsed =
            r.status === "running" && clockBase !== null && r.startAtMs !== undefined
              ? Math.max(0, now - clockBase - r.startAtMs)
              : undefined;
          return (
            <li
              key={`${r.parent ?? ""}/${r.name}`}
              className={`grid grid-cols-[1.5rem_1fr_auto] items-center gap-3 text-sm ${r.parent ? "pl-6" : ""}`}
            >
              <span
                aria-hidden
                className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold ${g.tone} ${
                  r.status === "running" ? "border-t-transparent motion-safe:animate-spin" : ""
                }`}
              >
                {g.mark}
              </span>
              <span className={`min-w-0 ${r.status === "pending" ? "text-fog" : "text-paper"}`}>
                {r.label}
                <span className="sr-only">: {g.word}</span>
                {r.reason && r.status !== "ok" ? (
                  <span className="block truncate text-xs text-fog" title={r.reason}>
                    {r.reason}
                  </span>
                ) : null}
              </span>
              <span className="num whitespace-nowrap text-xs text-fog">
                {r.status === "running"
                  ? elapsed !== undefined
                    ? secs(elapsed)
                    : "…"
                  : r.ms !== undefined
                    ? secs(r.ms)
                    : r.status === "pending"
                      ? ""
                      : g.word}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
