import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** Shape of fixtures/api/<source>/<key>.json */
export interface MockFixture<T> {
  fetchedAt?: string;
  data: T;
}

export function isMockMode(): boolean {
  return process.env.ADPILOT_MOCK_APIS === "1";
}

function fixtureRoot(): string {
  return process.env.ADPILOT_FIXTURE_DIR || path.join(process.cwd(), "fixtures", "api");
}

function safeKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Reads fixtures/api/<source>/<key>.json, falling back to default.json.
 * Returns null when neither exists or the JSON is invalid.
 */
export async function readFixture<T>(
  source: string,
  key?: string
): Promise<MockFixture<T> | null> {
  const dir = path.join(fixtureRoot(), safeKey(source));
  const names = [key ? safeKey(key) : "", "default"].filter(Boolean);
  for (const name of names) {
    try {
      const raw = await readFile(path.join(dir, `${name}.json`), "utf8");
      const parsed = JSON.parse(raw) as MockFixture<T>;
      if (parsed && typeof parsed === "object" && "data" in parsed) return parsed;
    } catch {
      /* try the next name */
    }
  }
  return null;
}
