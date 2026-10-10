import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import vm from "node:vm";
import { CHANNEL_COLORS } from "@/lib/colors";
import {
  channelColor,
  contrast,
  ensureContrast,
  THEME_INIT_SCRIPT,
  THEME_PALETTE,
  THEME_STORAGE_KEY,
  type ThemeName,
} from "@/lib/theme";
import type { ChannelId } from "@/lib/types";

const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8").toLowerCase();
const THEMES: ThemeName[] = ["light", "dark"];

function block(selector: string): string {
  const i = css.indexOf(selector);
  assert.ok(i >= 0, `missing ${selector}`);
  return css.slice(i, css.indexOf("}", i));
}

describe("Ledger palette", () => {
  it("TS palette matches the CSS variables (charts and CSS agree)", () => {
    const vars = { bg: "--ink", surface: "--surface", text: "--paper", muted: "--fog", accent: "--sand", good: "--mint", bad: "--danger", mock: "--ice" } as const;
    const blocks: Record<ThemeName, string> = { light: block(':root[data-theme="light"]'), dark: block(':root[data-theme="dark"]') };
    for (const t of THEMES) {
      for (const [k, v] of Object.entries(vars)) {
        const hex = THEME_PALETTE[t][k as keyof typeof vars];
        assert.ok(blocks[t].includes(`${v}: ${hex}`), `${t} ${v} should be ${hex}`);
      }
    }
  });

  it("every text colour is WCAG AA (4.5:1) on page and card, both themes", () => {
    for (const t of THEMES) {
      const p = THEME_PALETTE[t];
      for (const k of ["text", "muted", "accent", "good", "bad", "mock"] as const) {
        for (const bg of [p.bg, p.surface]) {
          assert.ok(contrast(p[k], bg) >= 4.5, `${t} ${k} on ${bg}: ${contrast(p[k], bg).toFixed(2)}`);
        }
      }
    }
  });

  it("chart series and every channel colour reach 3:1 on the card, both themes", () => {
    for (const t of THEMES) {
      const p = THEME_PALETTE[t];
      for (const s of p.series) assert.ok(contrast(s, p.surface) >= 3, `${t} series ${s}`);
      for (const id of Object.keys(CHANNEL_COLORS) as ChannelId[]) {
        const c = channelColor(id, t);
        assert.ok(contrast(c, p.surface) >= 3, `${t} ${id} ${c}: ${contrast(c, p.surface).toFixed(2)}`);
      }
    }
  });

  it("ensureContrast keeps colours that already pass and darkens ones that do not", () => {
    assert.equal(ensureContrast("#1877F2", "#ffffff"), "#1877f2");
    const wa = ensureContrast("#25D366", "#ffffff");
    assert.notEqual(wa, "#25d366");
    assert.ok(contrast(wa, "#ffffff") >= 3);
    assert.equal(channelColor("x", "light"), THEME_PALETTE.light.text, "near-white X follows the text colour");
  });
});

describe("theme init script", () => {
  function run(opts: { stored?: string; storageThrows?: boolean; osDark?: boolean }): string | undefined {
    let theme: string | undefined;
    const ctx = {
      localStorage: {
        getItem: (k: string) => {
          if (opts.storageThrows) throw new Error("SecurityError");
          return k === THEME_STORAGE_KEY ? (opts.stored ?? null) : null;
        },
      },
      window: { matchMedia: (q: string) => ({ matches: Boolean(opts.osDark) && q.includes("dark") }) },
      document: { documentElement: { setAttribute: (_: string, v: string) => (theme = v) } },
    };
    vm.runInNewContext(THEME_INIT_SCRIPT, ctx);
    return theme;
  }

  it("uses the saved choice, else the OS, and survives blocked storage", () => {
    assert.equal(run({ stored: "dark" }), "dark");
    assert.equal(run({ stored: "light", osDark: true }), "light");
    assert.equal(run({ osDark: true }), "dark");
    assert.equal(run({}), "light");
    assert.equal(run({ stored: "neon" }), "light", "junk values are ignored");
    assert.equal(run({ storageThrows: true, osDark: true }), "dark");
  });
});
