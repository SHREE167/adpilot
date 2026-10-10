import type { PlanStreamEvent, TraceEvent } from "./types";

/** Client-safe: the pipeline's step list and how streamed trace events move it. */

export type StepStatus = "pending" | TraceEvent["status"];

export interface StepRow {
  name: string;
  label: string;
  parent?: string;
  status: StepStatus;
  /** Server duration once settled. */
  ms?: number;
  /** Server clock (ms since run start) when the step started, for live elapsed. */
  startAtMs?: number;
  reason?: string;
}

/** runAgent's real order (lib/agent.ts). Unknown names from the server are appended. */
export const PIPELINE_STEPS: Omit<StepRow, "status">[] = [
  { name: "scrape", label: "Read the site" },
  { name: "recognize", label: "Recognize the product" },
  { name: "recognize_llm", label: "LLM product read" },
  { name: "enrich", label: "Gather local data" },
  { name: "siteReadiness", label: "Site checks", parent: "enrich" },
  { name: "localMarket", label: "Google Places", parent: "enrich" },
  { name: "calendar", label: "Festival calendar", parent: "enrich" },
  { name: "rate_card", label: "Load the rate card" },
  { name: "score", label: "Score 12 channels (XGBoost)" },
  { name: "signal_adjust", label: "Apply signals (season)" },
  { name: "zero_rupee", label: "Free actions first" },
  { name: "allocate", label: "Split the budget" },
  { name: "forecast", label: "Forecast reach and clicks" },
  { name: "copy_template", label: "Draft ads and outreach" },
  { name: "copy_llm", label: "LLM copy" },
  { name: "placements", label: "Pick placements" },
];

export function initialSteps(): StepRow[] {
  return PIPELINE_STEPS.map((s) => ({ ...s, status: "pending" }));
}

const key = (name: string, parent?: string) => `${parent ?? ""}/${name}`;

/** Pure reducer: one streamed event → the next rows. */
export function applyStepEvent(rows: StepRow[], e: TraceEvent): StepRow[] {
  let found = false;
  const next = rows.map((r) => {
    if (key(r.name, r.parent) === key(e.name, e.parent)) {
      found = true;
      return {
        ...r,
        status: e.status,
        ...(e.status === "running" ? { startAtMs: e.atMs } : {}),
        ...(e.ms !== undefined ? { ms: e.ms } : {}),
        ...(e.reason ? { reason: e.reason } : {}),
      };
    }
    // Sources run in parallel inside enrich: they are all in flight while it is.
    if (e.status === "running" && r.parent === e.name && r.status === "pending") {
      return { ...r, status: "running" as const, startAtMs: e.atMs };
    }
    return r;
  });
  if (found) return next;
  const label = e.name.replace(/_/g, " ");
  const row: StepRow = {
    name: e.name,
    label,
    ...(e.parent ? { parent: e.parent } : {}),
    status: e.status,
    ...(e.status === "running" ? { startAtMs: e.atMs } : {}),
    ...(e.ms !== undefined ? { ms: e.ms } : {}),
    ...(e.reason ? { reason: e.reason } : {}),
  };
  if (e.parent) {
    const lastChild = next.map((r) => r.parent === e.parent || r.name === e.parent).lastIndexOf(true);
    if (lastChild >= 0) return [...next.slice(0, lastChild + 1), row, ...next.slice(lastChild + 1)];
  }
  return [...next, row];
}

/** After a failed run, a step still "running" is marked stopped; never-reached steps stay pending. */
export function closeSteps(rows: StepRow[], failed: boolean): StepRow[] {
  return rows.map((r) =>
    r.status === "running" && failed
      ? { ...r, status: "error" as const, reason: r.reason || "stopped" }
      : r
  );
}

/** Reads an NDJSON body line by line. Invalid lines are skipped; returns the events seen. */
export async function readPlanStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: PlanStreamEvent) => void
): Promise<number> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let count = 0;
  const flush = (line: string) => {
    const s = line.trim();
    if (!s) return;
    try {
      onEvent(JSON.parse(s) as PlanStreamEvent);
      count++;
    } catch {
      /* ignore a partial or invalid line */
    }
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      flush(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  flush(buffer + decoder.decode());
  return count;
}
