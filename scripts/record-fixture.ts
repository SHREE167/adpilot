// Run via `npm run record -- <source>` (scripts/record-fixture.mjs loads .env.local).
// One real call per source; writes fixtures/api-raw/* (raw, redacted) and
// fixtures/api/<source>/<key>.json (parsed, what mock mode serves).
// Prints status and counts only: never a key, token or header.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  channelsUrl,
  creatorQuery,
  searchUrl,
  toCreatorFinder,
  YOUTUBE_SOURCE,
  ytInit,
  type YtChannelsResponse,
  type YtSearchResponse,
} from "@/lib/enrich/youtube-creators";
import golden from "../eval/golden-briefs.json";
import type { PlanInput } from "@/lib/types";

const root = process.cwd();
const BRIEFS = (golden as { briefs: { id: string; expectedCategory: string; input: PlanInput }[] }).briefs;
/** The demo brief: ₹3k Tamil student snack in Chennai. */
const DEMO = BRIEFS.find((b) => b.id === "sig-3k-student")!;

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function write(rel: string, data: unknown): void {
  const file = path.join(root, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`  wrote ${rel}`);
}

/** Public channel text can still carry a creator's email/phone: drop them. */
function redact(text: string | undefined): string | undefined {
  if (!text) return text;
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/(\+?\d[\d\s-]{8,}\d)/g, "[phone]");
}

async function getJson<T>(url: string, init: RequestInit): Promise<{ status: number; body: T | null }> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const body = (await res.json().catch(() => null)) as T | null;
  return { status: res.status, body };
}

function need(...keys: string[]): boolean {
  const missing = keys.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing in .env.local: ${missing.join(", ")}`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

async function youtube(): Promise<void> {
  if (!need("YOUTUBE_API_KEY")) return;
  const q = creatorQuery(DEMO.input, { category: DEMO.expectedCategory })!;
  console.log(`YouTube: search.list q="${q.q}" relevanceLanguage=${q.language} (100 units) + channels.list (1 unit)`);
  const init = ytInit(process.env.YOUTUBE_API_KEY!);
  const search = await getJson<YtSearchResponse>(searchUrl(q), init);
  console.log(`  search.list HTTP ${search.status}, ${search.body?.items?.length ?? 0} channels`);
  if (search.status !== 200 || !search.body) {
    process.exitCode = 1;
    return;
  }
  const ids = [...new Set((search.body.items || []).map((i) => i.id?.channelId).filter((x): x is string => Boolean(x)))];
  const channels = await getJson<YtChannelsResponse>(channelsUrl(ids), init);
  console.log(`  channels.list HTTP ${channels.status}, ${channels.body?.items?.length ?? 0} channels`);
  if (channels.status !== 200 || !channels.body) {
    process.exitCode = 1;
    return;
  }
  const raw: YtChannelsResponse = {
    items: (channels.body.items || []).map((c) => ({
      id: c.id,
      snippet: {
        title: c.snippet?.title,
        description: redact(c.snippet?.description),
        customUrl: c.snippet?.customUrl,
        country: c.snippet?.country,
        defaultLanguage: c.snippet?.defaultLanguage,
      },
      statistics: c.statistics,
    })),
  };
  const rawSearch: YtSearchResponse = {
    items: (search.body.items || []).map((i) => ({ id: { channelId: i.id?.channelId }, snippet: { title: i.snippet?.title } })),
  };
  const data = toCreatorFinder(rawSearch, raw, q);
  const fetchedAt = new Date().toISOString();
  console.log(`  ${data.inBand} of ${data.found} in the 2k-200k band; top ${data.picks.length} kept`);
  write("fixtures/api-raw/youtube-search.json", { query: q, recordedAt: fetchedAt, response: rawSearch });
  write("fixtures/api-raw/youtube-channels.json", { recordedAt: fetchedAt, response: raw });
  write(`fixtures/api/${YOUTUBE_SOURCE}/${slug(DEMO.input.city)}.json`, { fetchedAt, data });
  if (!existsSync(path.join(root, "fixtures", "api", YOUTUBE_SOURCE, "default.json"))) {
    write(`fixtures/api/${YOUTUBE_SOURCE}/default.json`, { fetchedAt, data });
  }
}

const SOURCES: Record<string, () => Promise<void>> = { youtube };

const which = process.argv[2];
if (!which || !SOURCES[which]) {
  console.error(`Usage: npm run record -- <${Object.keys(SOURCES).join("|")}>`);
  process.exitCode = 1;
} else {
  SOURCES[which]().catch((err: unknown) => {
    // Error text only (fetch errors never include our headers).
    console.error(`${which}: ${err instanceof Error ? err.message : "failed"}`);
    process.exitCode = 1;
  });
}
