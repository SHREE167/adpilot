"use client";

import { animate, createTimeline, stagger } from "animejs";
import { useEffect, useRef } from "react";

export function FloatingOrbs() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nodes = ref.current?.querySelectorAll(".orb");
    if (!nodes?.length) return;
    animate(nodes, {
      translateY: [-80, 70],
      translateX: [-40, 50],
      scale: [0.85, 1.15],
      duration: 7000,
      delay: stagger(400),
      ease: "inOutSine",
      loop: true,
      alternate: true,
    });
  }, []);
  return (
    <div ref={ref} className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="orb orb-c" />
    </div>
  );
}

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
        defaults: { ease: "out(4)", duration: 1100 },
      });
      tl.add(el, {
        opacity: [0, 1],
        scale: [0.88, 1],
        rotate: [1.6, 0],
      }, 0);
      if (bits.length) {
        tl.add(
          bits,
          {
            opacity: [0, 1],
            translateY: [90, 0],
            translateX: [-30, 0],
            rotate: [3, 0],
            delay: stagger(95, { from: "first" }),
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
        translateY: [40, 0],
        scale: [0.96, 1],
        duration: 1000,
        ease: "out(4)",
      });
      return;
    }
    animate(items, {
      opacity: [0, 1],
      translateY: [70, 0],
      rotate: [2, 0],
      delay: stagger(90),
      duration: 1000,
      ease: "out(4)",
    });
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
