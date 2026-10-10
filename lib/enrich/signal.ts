import "server-only";
import type { Signal } from "@/lib/types";
import { CACHE_TTL, cacheGet, cacheSet } from "./cache";
import { isMockMode, readFixture } from "./mock";

export type { Signal, SignalStatus } from "@/lib/types";

export const DEFAULT_TIMEOUT_MS = 5000;

export type TimeoutResult<T> = { ok: true; value: T } | { ok: false; timedOut: true };

/**
 * Runs fn with an AbortSignal. Resolves {ok:false, timedOut:true} after ms and
 * aborts the signal so the underlying fetch stops. Rejections from fn propagate.
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number
): Promise<TimeoutResult<T>> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<TimeoutResult<T>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ ok: false, timedOut: true });
    }, ms);
  });
  try {
    const work = Promise.resolve()
      .then(() => fn(controller.signal))
      .then((value): TimeoutResult<T> => ({ ok: true, value }));
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function skipped<T>(source: string, reason: string, ms = 0): Signal<T> {
  return {
    source,
    status: "skipped",
    fetchedAt: new Date().toISOString(),
    ms,
    cached: false,
    reason,
  };
}

export function okSignal<T>(source: string, data: T, ms = 0, fetchedAt?: string): Signal<T> {
  return {
    source,
    status: "ok",
    fetchedAt: fetchedAt ?? new Date().toISOString(),
    ms,
    cached: false,
    data,
  };
}

function errorReason(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 160) || err.name;
  return "unknown error";
}

/** fetch + JSON with a readable "HTTP 403" style error. Use inside runSource fetchers. */
export async function fetchJson<T>(
  url: string,
  signal: AbortSignal,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, { ...init, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export interface SourceOptions {
  /** Hard timeout for the live fetch. Default 5s. */
  timeoutMs?: number;
  /** Cache key; omit to skip caching. Prefix with the source name. */
  cacheKey?: string;
  ttlMs?: number;
  /** Fixture file name under fixtures/api/<source>/ (falls back to default.json). */
  mockKey?: string;
  /** Env vars that must be set for a live call; otherwise status "skipped". */
  requiresEnv?: string[];
}

interface CachedValue<T> {
  data: T;
  fetchedAt: string;
}

/**
 * The one pattern every data source uses:
 * mock fixture → required keys → cache hit → live fetch with timeout → cache.
 * Never throws; always returns a Signal.
 */
export async function runSource<T>(
  source: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
  opts: SourceOptions = {}
): Promise<Signal<T>> {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  try {
    if (isMockMode()) {
      const fx = await readFixture<T>(source, opts.mockKey);
      if (!fx) return { ...skipped<T>(source, "mock mode: no fixture", elapsed()), mock: true };
      return {
        ...okSignal(source, fx.data, elapsed(), fx.fetchedAt),
        mock: true,
        reason: "mock fixture",
      };
    }

    const missing = (opts.requiresEnv || []).filter((k) => !process.env[k]);
    if (missing.length) return skipped(source, `no API key (${missing.join(", ")})`, elapsed());

    if (opts.cacheKey) {
      const hit = await cacheGet<CachedValue<T>>(opts.cacheKey);
      if (hit) {
        return { ...okSignal(source, hit.data, elapsed(), hit.fetchedAt), cached: true };
      }
    }

    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const result = await withTimeout(fetcher, timeoutMs);
    if (!result.ok) {
      return {
        source,
        status: "timeout",
        fetchedAt: new Date().toISOString(),
        ms: elapsed(),
        cached: false,
        reason: `no response in ${Math.round(timeoutMs / 100) / 10}s`,
      };
    }

    const fetchedAt = new Date().toISOString();
    if (opts.cacheKey) {
      await cacheSet(
        opts.cacheKey,
        { data: result.value, fetchedAt } satisfies CachedValue<T>,
        opts.ttlMs ?? CACHE_TTL.default
      );
    }
    return okSignal(source, result.value, elapsed(), fetchedAt);
  } catch (err) {
    return {
      source,
      status: "error",
      fetchedAt: new Date().toISOString(),
      ms: elapsed(),
      cached: false,
      reason: errorReason(err),
    };
  }
}

type TaskMap<T> = { [K in keyof T]: () => Promise<T[K]> | T[K] };

/**
 * Runs every source in parallel via Promise.allSettled. A task that throws
 * becomes status "error" under its key; one failure never sinks the others.
 */
export async function runEnrichment<T extends Record<string, Signal<unknown>>>(
  tasks: TaskMap<T>,
  onSettled?: (key: keyof T & string, signal: Signal<unknown>) => void
): Promise<T> {
  const keys = Object.keys(tasks) as (keyof T & string)[];
  const t0 = Date.now();
  const settled = await Promise.allSettled(
    keys.map((k) => Promise.resolve().then(() => tasks[k]()))
  );
  const out = {} as T;
  settled.forEach((res, i) => {
    const key = keys[i];
    const signal: Signal<unknown> =
      res.status === "fulfilled"
        ? res.value
        : {
            source: key,
            status: "error",
            fetchedAt: new Date().toISOString(),
            ms: Date.now() - t0,
            cached: false,
            reason: errorReason(res.reason),
          };
    out[key] = signal as T[typeof key];
    onSettled?.(key, signal);
  });
  return out;
}
