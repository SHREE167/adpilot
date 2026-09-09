"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
      <div className="mx-auto flex max-w-[90rem] items-center justify-between gap-4 px-6 py-4 sm:px-12">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-sand/40 bg-sand text-sm font-black text-[#2a1608] shadow-[0_0_24px_rgba(232,195,106,0.35)]">
            AP
          </span>
          <span>
            <span className="display block text-lg leading-none">AdPilot</span>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.22em] text-sand">
              India · glass · ESTIMATE
            </span>
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active =
              l.href === "/"
                ? path === "/"
                : path === l.href || path.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 ${
                  active
                    ? "border border-sand/40 bg-white/10 text-sand"
                    : "text-fog hover:text-paper"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
