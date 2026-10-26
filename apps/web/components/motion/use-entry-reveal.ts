"use client";

import { useEffect, useRef, useState } from "react";

/**
 * - `static`: the finished state. Server HTML, the first client render, reduced motion, and
 *   anything already on screen when scripts arrive.
 * - `waiting`: still below (or above) the viewport after hydration, so it can be hidden unseen.
 * - `play`: it has scrolled into view; animate it in, once.
 */
export type EntryPhase = "static" | "waiting" | "play";

const prefersReducedMotion = () =>
  typeof window.matchMedia !== "function" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Decides whether an element animates in. Content is never hidden before scripts run, and an
 * element the visitor can already see is never hidden and replayed, so nothing flickers and the
 * largest text paints straight away.
 */
export function useEntryReveal<T extends Element>() {
  const ref = useRef<T>(null);
  const [phase, setPhase] = useState<EntryPhase>("static");

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion() || typeof IntersectionObserver !== "function") return;
    let waiting = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (!waiting) {
          // First report: where the element is now. On screen means leave it as it is.
          const { top, bottom } = entry.boundingClientRect;
          if (entry.isIntersecting || (top < window.innerHeight && bottom > 0)) {
            observer.disconnect();
            return;
          }
          waiting = true;
          setPhase("waiting");
          return;
        }
        if (entry.isIntersecting) {
          observer.disconnect();
          setPhase("play");
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { ref, phase };
}
