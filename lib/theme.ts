import { CHANNEL_COLORS } from "./colors";
import type { ChannelId } from "./types";

/** Midnight Pro theme: client-safe helpers for the dark/light toggle and chart colours. */

export type ThemeName = "light" | "dark";

export const THEME_STORAGE_KEY = "adpilot.theme";

/** Dark is AdPilot's identity; light is the variant behind the toggle. */
export const DEFAULT_THEME: ThemeName = "dark";

/**
 * Runs in <head> before paint: stored choice, else dark.
 * localStorage can throw (privacy mode, blocked storage), hence try/catch.
 */
export const THEME_INIT_SCRIPT = `(function(){var t;try{t=localStorage.getItem("${THEME_STORAGE_KEY}")}catch(e){}if(t!=="light"&&t!=="dark"){t="${DEFAULT_THEME}"}document.documentElement.setAttribute("data-theme",t)})();`;

/** Mirrors the CSS variables in app/globals.css (tests/theme.test.ts keeps them in sync). */
export const THEME_PALETTE: Record<
  ThemeName,
  {
    bg: string;
    surface: string;
    /** quiet fills (bands, active nav) */
    tint: string;
    text: string;
    muted: string;
    rule: string;
    /** input borders, >= 3:1 on the card */
    ruleStrong: string;
    accent: string;
    good: string;
    bad: string;
    mock: string;
    /** impressions, clicks, spend */
    series: [string, string, string];
  }
> = {
  dark: {
    bg: "#0a0a0b",
    surface: "#131316",
    tint: "#1a1a1f",
    text: "#ededef",
    muted: "#a0a0ab",
    rule: "#25252b",
    ruleStrong: "#64646f",
    accent: "#9d8cff",
    good: "#3ddc97",
    bad: "#ff7a7a",
    mock: "#7dd3fc",
    series: ["#9d8cff", "#3ddc97", "#f7b955"],
  },
  light: {
    bg: "#fafafa",
    surface: "#ffffff",
    tint: "#f2f2f5",
    text: "#0a0a0b",
    muted: "#55555f",
    rule: "#e6e6ea",
    ruleStrong: "#8b8b96",
    accent: "#5b45e0",
    good: "#047857",
    bad: "#c0262d",
    mock: "#0369a1",
    series: ["#5b45e0", "#047857", "#b45309"],
  },
};

function channels(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function mix(hex: string, toward: string, t: number): string {
  const a = channels(hex);
  const b = channels(toward);
  return `#${a
    .map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0"))
    .join("")}`;
}

/**
 * Keeps a brand hue but darkens (on light) or lightens (on dark) it until it
 * reaches `min` contrast against bg. WCAG 1.4.11 asks 3:1 for chart marks.
 */
export function ensureContrast(hex: string, bg: string, min = 3): string {
  if (contrast(hex, bg) >= min) return hex.toLowerCase();
  const toward = luminance(bg) > 0.5 ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1; t += 0.05) {
    const c = mix(hex, toward, t);
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}

/** Channel colour that stays readable on this theme's surface. X is near-white, so it follows the text colour. */
export function channelColor(id: ChannelId, theme: ThemeName): string {
  const p = THEME_PALETTE[theme];
  if (id === "x") return p.text;
  return ensureContrast(CHANNEL_COLORS[id], p.surface);
}

export function channelColors(theme: ThemeName): Record<ChannelId, string> {
  return Object.fromEntries(
    (Object.keys(CHANNEL_COLORS) as ChannelId[]).map((id) => [id, channelColor(id, theme)])
  ) as Record<ChannelId, string>;
}
