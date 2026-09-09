import "server-only";
import { normalizeDomain } from "./format";
import type { SiteSnapshot } from "./types";

const TIMEOUT_MS = 4000;

function decodeEntities(html: string): string {
  return html
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "));
}

function metaContent(html: string, key: string): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${key}["'][^>]+content=["']([^"']*)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${key}["']`,
      "i"
    ),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  return null;
}

function jsonLdName(html: string): { name: string | null; type: string | null } {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const data = JSON.parse(b[1] || "null") as Record<string, unknown> | Record<string, unknown>[];
      const node = Array.isArray(data) ? data[0] : data;
      if (!node || typeof node !== "object") continue;
      const name = typeof node.name === "string" ? node.name : null;
      const type = typeof node["@type"] === "string" ? node["@type"] : null;
      if (name || type) return { name, type };
    } catch {
      /* ignore bad JSON-LD */
    }
  }
  return { name: null, type: null };
}

function parseHtml(html: string): Pick<
  SiteSnapshot,
  "title" | "description" | "h1" | "ogTitle" | "ogImage" | "jsonLdName" | "jsonLdType" | "textExcerpt"
> {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const ld = jsonLdName(html);
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  return {
    title: titleMatch ? stripTags(titleMatch[1]).slice(0, 180) : null,
    description:
      metaContent(html, "description") ||
      metaContent(html, "og:description") ||
      null,
    h1: h1Match ? stripTags(h1Match[1]).slice(0, 180) : null,
    ogTitle: metaContent(html, "og:title"),
    ogImage: metaContent(html, "og:image"),
    jsonLdName: ld.name,
    jsonLdType: ld.type,
    textExcerpt: stripTags(body).slice(0, 600),
  };
}

export async function scrapeSite(
  domain: string,
  productName: string
): Promise<SiteSnapshot> {
  const host = normalizeDomain(domain);
  if (!host) {
    return {
      domain: "",
      url: "",
      title: productName || null,
      description: null,
      h1: null,
      ogTitle: null,
      ogImage: null,
      jsonLdName: null,
      jsonLdType: null,
      textExcerpt: productName || null,
      scraped: false,
      scrapeError: "No domain provided; continuing with product_name",
    };
  }

  const skip =
    host === "localhost" ||
    host.endsWith(".local") ||
    host.startsWith("example.") ||
    host.startsWith("example-") ||
    host.endsWith(".example");
  if (skip) {
    return {
      domain: host,
      url: `https://${host}`,
      title: productName || null,
      description: null,
      h1: null,
      ogTitle: null,
      ogImage: null,
      jsonLdName: null,
      jsonLdType: null,
      textExcerpt: productName || null,
      scraped: false,
      scrapeError: "Non-public domain skipped; continuing with product_name",
    };
  }

  const url = `https://${host}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AdPilotBot/1.0; +https://adpilot.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) {
      return {
        domain: host,
        url,
        title: productName || null,
        description: null,
        h1: null,
        ogTitle: null,
        ogImage: null,
        jsonLdName: null,
        jsonLdType: null,
        textExcerpt: productName || null,
        scraped: false,
        scrapeError: `Fetch ${res.status}; continuing with product_name`,
      };
    }
    const html = await res.text();
    const parsed = parseHtml(html);
    return {
      domain: host,
      url,
      title: parsed.title || productName || null,
      description: parsed.description,
      h1: parsed.h1,
      ogTitle: parsed.ogTitle,
      ogImage: parsed.ogImage,
      jsonLdName: parsed.jsonLdName,
      jsonLdType: parsed.jsonLdType,
      textExcerpt: parsed.textExcerpt,
      scraped: true,
    };
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Timed out after 4s; continuing with product_name"
        : `Blocked or unreachable; continuing with product_name`;
    return {
      domain: host,
      url,
      title: productName || null,
      description: null,
      h1: null,
      ogTitle: null,
      ogImage: null,
      jsonLdName: null,
      jsonLdType: null,
      textExcerpt: productName || null,
      scraped: false,
      scrapeError: message,
    };
  } finally {
    clearTimeout(timer);
  }
}
