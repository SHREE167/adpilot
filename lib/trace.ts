import type { PlanTrace, Signal, TraceEvent, TraceMeta, TraceSpan } from "./types";

export interface SpanOptions<T> {
  parent?: string;
  /** Static meta, or derived from the step result (keep it to small summaries). */
  meta?: TraceMeta | ((result: T) => TraceMeta);
}

export interface Trace {
  /** Times fn and records ok/error. Errors are recorded and rethrown (core steps still fail loudly). */
  span<T>(name: string, fn: () => Promise<T> | T, opts?: SpanOptions<T>): Promise<T>;
  /** Records a step that did not run, e.g. LLM skipped for budget. */
  skip(name: string, reason: string, parent?: string): void;
  /** Records a tool call from its Signal (status, ms, cache hit, reason). */
  signal(name: string, signal: Signal<unknown>, parent?: string): void;
  elapsed(): number;
  finish(): PlanTrace;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 160) : "unknown error";
}

export type TraceListener = (event: TraceEvent) => void;

/**
 * F15: the agent's observability layer. One trace per runAgent call.
 * onEvent (optional) receives each step as it starts and settles, for live progress.
 * A listener that throws is ignored: progress must never break a plan.
 */
export function createTrace(now: () => number = Date.now, onEvent?: TraceListener): Trace {
  const t0 = now();
  const spans: TraceSpan[] = [];
  const emit = (e: TraceEvent) => {
    if (!onEvent) return;
    try {
      onEvent(e);
    } catch {
      /* progress is best-effort */
    }
  };
  const settled = (s: TraceSpan, reason?: string) =>
    emit({
      name: s.name,
      ...(s.parent ? { parent: s.parent } : {}),
      status: s.status,
      atMs: s.startMs + s.ms,
      ms: s.ms,
      ...(reason ? { reason } : {}),
    });

  return {
    async span(name, fn, opts = {}) {
      const start = now();
      emit({ name, ...(opts.parent ? { parent: opts.parent } : {}), status: "running", atMs: start - t0 });
      try {
        const result = await fn();
        const meta = typeof opts.meta === "function" ? opts.meta(result) : opts.meta;
        spans.push({
          name,
          parent: opts.parent,
          startMs: start - t0,
          ms: now() - start,
          status: "ok",
          ...(meta ? { meta } : {}),
        });
        settled(spans[spans.length - 1]);
        return result;
      } catch (err) {
        spans.push({
          name,
          parent: opts.parent,
          startMs: start - t0,
          ms: now() - start,
          status: "error",
          error: message(err),
        });
        settled(spans[spans.length - 1], message(err));
        throw err;
      }
    },

    skip(name, reason, parent) {
      spans.push({ name, parent, startMs: now() - t0, ms: 0, status: "skipped", meta: { reason } });
      settled(spans[spans.length - 1], reason);
    },

    signal(name, s, parent) {
      const meta: TraceMeta = { source: s.source, cached: s.cached };
      if (s.mock) meta.mock = true;
      if (s.reason) meta.reason = s.reason;
      spans.push({
        name,
        parent,
        startMs: Math.max(0, now() - t0 - s.ms),
        ms: s.ms,
        status: s.status,
        meta,
      });
      settled(spans[spans.length - 1], s.reason);
    },

    elapsed() {
      return now() - t0;
    },

    finish() {
      return {
        startedAt: new Date(t0).toISOString(),
        totalMs: now() - t0,
        spans: [...spans].sort((a, b) => a.startMs - b.startMs),
      };
    },
  };
}
