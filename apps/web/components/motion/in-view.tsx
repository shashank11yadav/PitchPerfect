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
 * Changes from the original: the server render and anything already on screen start in the
 * visible state (`initial={false}`), so content never waits on scripts and never flickers; only
 * content still off screen after hydration is hidden and revealed once. Reduced motion keeps it
 * static. Children can join a stagger through `InViewItem`. Typed for this repo's lint rules.
 */

import { motion, type Transition, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { useEntryReveal } from "./use-entry-reveal";

/** Shared timing (docs/design-system.md, Motion). */
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

/** Rises 24 px with opacity; hiding is instant because it happens off screen. */
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 24, transition: { duration: 0 } },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE_OUT } },
};

const ELEMENTS = {
  div: motion.div,
  section: motion.section,
  ul: motion.ul,
  ol: motion.ol,
  li: motion.li,
  figure: motion.figure,
} as const;

interface InViewProps {
  children: ReactNode;
  /** Defaults to a stagger container; pass item variants to animate the element itself. */
  variants?: Variants;
  transition?: Transition;
  as?: keyof typeof ELEMENTS;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
}

/** Reveals its content once, as it first scrolls into view. */
export function InView({
  children,
  variants = containerVariants,
  transition,
  as = "div",
  ...props
}: InViewProps) {
  const { ref, phase } = useEntryReveal<HTMLDivElement>();
  const Component = ELEMENTS[as] as typeof motion.div;
  return (
    <Component
      ref={ref}
      data-reveal={phase}
      initial={false}
      animate={phase === "waiting" ? "hidden" : "visible"}
      variants={variants}
      transition={transition}
      {...props}
    >
      {children}
    </Component>
  );
}

interface InViewItemProps {
  children: ReactNode;
  as?: keyof typeof ELEMENTS;
  className?: string;
}

/** One step of an `InView` stagger: heading, then text, then the picture. */
export function InViewItem({ children, as = "div", className }: InViewItemProps) {
  const Component = ELEMENTS[as] as typeof motion.div;
  return (
    <Component variants={itemVariants} className={className}>
      {children}
    </Component>
  );
}
