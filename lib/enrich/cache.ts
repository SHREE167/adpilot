import "server-only";
import { sql } from "@vercel/postgres";

const HOUR = 60 * 60 * 1000;

/** Brief section 3: PageSpeed 24h, Places/Meta/YouTube/Trends 7d. */
export const CACHE_TTL = {
  pageSpeed: 24 * HOUR,
  places: 7 * 24 * HOUR,
  metaReach: 7 * 24 * HOUR,
  youtube: 7 * 24 * HOUR,
  trends: 7 * 24 * HOUR,
  default: 7 * 24 * HOUR,
} as const;

interface MemoryEntry {
  value: unknown;
  expiresAt: number;
}

interface CacheBox {
  map: Map<string, MemoryEntry>;
  pgReady: boolean;
}

const g = globalThis as typeof globalThis & { __adpilotCache?: CacheBox };

function box(): CacheBox {
  if (!g.__adpilotCache) g.__adpilotCache = { map: new Map(), pgReady: false };
  return g.__adpilotCache;
}

function hasPostgres(): boolean {
  return Boolean(process.env.POSTGRES_URL);
}

async function ensureCacheTable(): Promise<boolean> {
  if (!hasPostgres()) return false;
  const b = box();
  if (b.pgReady) return true;
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS adpilot_cache (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      )
    `;
    b.pgReady = true;
    return true;
  } catch {
    return false;
  }
}

/** Returns the cached value, or null when missing or expired. Never throws. */
export async function cacheGet<T>(key: string, now: number = Date.now()): Promise<T | null> {
  const b = box();
  const hit = b.map.get(key);
  if (hit) {
    if (hit.expiresAt > now) return hit.value as T;
    b.map.delete(key);
  }
  if (!(await ensureCacheTable())) return null;
  try {
    const { rows } = await sql`
      SELECT value, expires_at FROM adpilot_cache
      WHERE key = ${key} AND expires_at > ${new Date(now).toISOString()}::timestamptz
      LIMIT 1
    `;
    if (!rows[0]) return null;
    const expiresAt = new Date(rows[0].expires_at as string).getTime();
    b.map.set(key, { value: rows[0].value, expiresAt });
    return rows[0].value as T;
  } catch {
    return null;
  }
}

/** Stores value until now + ttlMs. Memory always; Postgres when configured. Never throws. */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlMs: number,
  now: number = Date.now()
): Promise<void> {
  const expiresAt = now + ttlMs;
  box().map.set(key, { value, expiresAt });
  if (!(await ensureCacheTable())) return;
  try {
    await sql`
      INSERT INTO adpilot_cache (key, value, expires_at)
      VALUES (${key}, ${JSON.stringify(value)}::jsonb, ${new Date(expiresAt).toISOString()}::timestamptz)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
    `;
  } catch {
    /* memory copy still serves this instance */
  }
}

/** Test helper: clears the in-memory layer only. */
export function cacheClearMemory(): void {
  box().map.clear();
}
