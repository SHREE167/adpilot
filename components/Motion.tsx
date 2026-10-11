"use client";

import { animate, createTimeline, stagger } from "animejs";
import { useEffect, useRef } from "react";

function reducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function StoryScene({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      el.style.opacity = "1";
      el.querySelectorAll<HTMLElement>(".story-bit").forEach((n) => {
        n.style.opacity = "1";
      });
      return;
    }
    el.style.opacity = "0";
    const play = () => {
      const bits = el.querySelectorAll(".story-bit");
      const tl = createTimeline({
        defaults: { ease: "out(3)", duration: 600 },
      });
      // Calm entrance: a short fade-up, no scale or rotation.
      tl.add(el, {
        opacity: [0, 1],
        translateY: [12, 0],
      }, 0);
      if (bits.length) {
        tl.add(
          bits,
          {
            opacity: [0, 1],
            translateY: [14, 0],
            delay: stagger(45, { from: "first" }),
          },
          40
        );
      }
    };
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            play();
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section
      id={id}
      ref={ref}
      className={`story-scene relative opacity-0 ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * Counts up once, the first time the number scrolls into view. After that a new
 * value (e.g. from the budget slider) is shown immediately, with no re-count.
 */
export function CountUp({
  value,
  format,
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmtRef = useRef(format);
  fmtRef.current = format;
  const played = useRef(false);
  const latest = useRef(value);
  latest.current = value;
  const fmt = (n: number) => (fmtRef.current ?? ((x: number) => String(Math.round(x))))(n);

  // First appearance: one count-up (or the final value under reduced motion).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) {
      played.current = true;
      el.textContent = fmt(latest.current);
      return;
    }
    const obj = { n: 0 };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        animate(obj, {
          n: latest.current,
          duration: 1200,
          ease: "out(4)",
          onUpdate: () => {
            if (!played.current) el.textContent = fmt(obj.n);
          },
          onComplete: () => {
            played.current = true;
            el.textContent = fmt(latest.current);
          },
        });
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Later changes: show the new number straight away.
  useEffect(() => {
    const el = ref.current;
    if (el && played.current) el.textContent = fmt(value);
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {fmt(0)}
    </span>
  );
}
