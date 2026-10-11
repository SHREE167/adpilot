"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

const LINKS = [
  { href: "/", label: "New plan" },
  { href: "/plans", label: "Plans" },
  { href: "/compare", label: "Compare" },
  { href: "/rate-card", label: "Rate card" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="nav-glass sticky top-0 z-40">
      <div className="page flex flex-wrap items-center justify-between gap-3 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-sand text-xs font-bold text-on-sand">AP</span>
          <span className="display text-lg leading-none">AdPilot</span>
          <span className="hidden text-sm text-fog sm:inline">India media plans, estimated</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Main">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path === l.href || path.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-1.5 ${active ? "bg-tint text-paper" : "text-fog hover:text-paper"}`}
              >
                {l.label}
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
