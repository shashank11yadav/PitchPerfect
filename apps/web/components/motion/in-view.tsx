"use client";

/*
 * Adapted from Motion Primitives, components/core/in-view.tsx
 * https://github.com/ibelick/motion-primitives (commit 120f64f)
 *
 * Copyright (c) 2024 ibelick
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 * and associated documentation files (the "Software"), to deal in the Software without
 * restriction, including without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or
 * substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * Changes from the original: the motion components are replaced by a `data-reveal` attribute and
 * CSS transitions (app/globals.css, "Entry reveals"), so pages built from these sections load no
 * animation library. The server render and anything already on screen start in the visible
 * state, so content never waits on scripts and never flickers; only content still off screen
 * after hydration is hidden and revealed once. Reduced motion keeps it static. Children join the
 * stagger through `InViewItem`. Typed for this repo's lint rules.
 */

import { useEffect, type ReactNode } from "react";
import { useEntryReveal } from "./use-entry-reveal";

type Tag = "div" | "section" | "ul" | "ol" | "li" | "figure";

interface InViewProps {
  children: ReactNode;
  as?: Tag;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
}

/** Reveals its content once, as it first scrolls into view. */
export function InView({ children, as = "div", ...props }: InViewProps) {
  const { ref, phase } = useEntryReveal<HTMLDivElement>();
  // One element type for the ref; the tag only changes the semantics.
  const Component = as as "div";

  // Each item's place in the stagger, in document order: heading, then text, then the picture.
  useEffect(() => {
    if (phase !== "waiting" || !ref.current) return;
    ref.current.querySelectorAll<HTMLElement>("[data-reveal-item]").forEach((item, index) => {
      item.style.setProperty("--reveal-index", String(index));
    });
  }, [phase, ref]);

  return (
    <Component ref={ref} data-reveal={phase} {...props}>
      {children}
    </Component>
  );
}

interface InViewItemProps {
  children: ReactNode;
  as?: Tag;
  className?: string;
}

/** One step of an `InView` stagger: it rises 24 px as it fades in. */
export function InViewItem({ children, as: Component = "div", className }: InViewItemProps) {
  return (
    <Component data-reveal-item="" className={className}>
      {children}
    </Component>
  );
}
