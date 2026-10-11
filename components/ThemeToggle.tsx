"use client";

import { useEffect, useState } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, type ThemeName } from "@/lib/theme";

function current(): ThemeName {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : DEFAULT_THEME;
}

/** The active theme; follows the toggle (data-theme on <html>). Dark unless the user picked light. */
export function useTheme(): ThemeName {
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  useEffect(() => {
    setTheme(current());
    const obs = new MutationObserver(() => setTheme(current()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export function ThemeToggle() {
  const theme = useTheme();
  const next: ThemeName = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className="grid h-9 w-9 place-items-center rounded-lg border border-rule-strong text-fog hover:border-sand hover:text-sand"
    >
      <span aria-hidden className="text-base leading-none">
        {theme === "dark" ? "☀" : "☾"}
      </span>
    </button>
  );
}
