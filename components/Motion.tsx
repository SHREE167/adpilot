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
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = format ?? ((n: number) => String(Math.round(n)));
    if (reducedMotion()) {
      el.textContent = fmt(value);
      return;
    }
    const obj = { n: 0 };
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        animate(obj, {
          n: value,
          duration: 1600,
          ease: "out(5)",
          onUpdate: () => {
            el.textContent = fmt(obj.n);
          },
        });
        io.disconnect();
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, format]);
  return (
    <span ref={ref} className={className}>
      {format ? format(0) : "0"}
    </span>
  );
}

export function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reducedMotion()) return;
    const items = el.querySelectorAll(".reveal");
    if (!items.length) {
      animate(el, {
        opacity: [0, 1],
        translateY: [12, 0],
        duration: 600,
        ease: "out(3)",
      });
      return;
    }
    animate(items, {
      opacity: [0, 1],
      translateY: [14, 0],
      delay: stagger(45),
      duration: 600,
      ease: "out(3)",
    });
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
