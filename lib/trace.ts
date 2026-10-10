import type { PlanTrace, Signal, TraceMeta, TraceSpan } from "./types";

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

/** F15: the agent's observability layer. One trace per runAgent call. */
export function createTrace(now: () => number = Date.now): Trace {
  const t0 = now();
  const spans: TraceSpan[] = [];

  return {
    async span(name, fn, opts = {}) {
      const start = now();
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
        throw err;
      }
    },

    skip(name, reason, parent) {
      spans.push({ name, parent, startMs: now() - t0, ms: 0, status: "skipped", meta: { reason } });
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
