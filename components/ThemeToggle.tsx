"use client";

import { useEffect, useState } from "react";
import { THEME_STORAGE_KEY, type ThemeName } from "@/lib/theme";

function current(): ThemeName {
  if (typeof document === "undefined") return "light";
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "light" || t === "dark") return t;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function stored(): ThemeName | null {
  try {
    const t = localStorage.getItem(THEME_STORAGE_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

/** The active theme; follows the toggle (data-theme) and the OS when no choice is saved. */
export function useTheme(): ThemeName {
  const [theme, setTheme] = useState<ThemeName>("light");
  useEffect(() => {
    setTheme(current());
    const obs = new MutationObserver(() => setTheme(current()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onOs = () => {
      if (!stored()) document.documentElement.setAttribute("data-theme", mq?.matches ? "dark" : "light");
    };
    mq?.addEventListener?.("change", onOs);
    return () => {
      obs.disconnect();
      mq?.removeEventListener?.("change", onOs);
    };
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
      className="grid h-9 w-9 place-items-center rounded-full border border-rule-strong text-fog hover:border-sand hover:text-sand"
    >
      <span aria-hidden className="text-base leading-none">
        {theme === "dark" ? "☀" : "☾"}
      </span>
    </button>
  );
}
