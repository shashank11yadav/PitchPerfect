"use client";

/*
 * Adapted from Motion Primitives, components/core/text-effect.tsx
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
 * Changes from the original: trimmed to the `fade` and `slide` presets and the `span`/`p` tags
 * used here, the blur presets removed (filters are costly on long text), custom variants and
 * exit staggering dropped, and the types tightened for this repo's lint rules. As upstream, word
 * and character modes render the full text once for assistive tech and hide the pieces.
 */

import { AnimatePresence, motion, type TargetAndTransition, type Variants } from "motion/react";
import { memo } from "react";

type Per = "word" | "char";
type Preset = "fade" | "slide";

const STAGGER: Record<Per, number> = { char: 0.03, word: 0.05 };

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: {},
};

interface PresetVariants {
  hidden: TargetAndTransition;
  visible: TargetAndTransition;
  exit: TargetAndTransition;
}

const PRESETS: Record<Preset, PresetVariants> = {
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slide: {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
};

/** Letters as a reader sees them, so accented and combined characters stay whole. */
const graphemes = (text: string) =>
  Array.from(
    new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text),
    (part) => part.segment,
  );

const Segment = memo(function Segment({
  segment,
  variants,
  per,
}: {
  segment: string;
  variants: Variants;
  per: Per;
}) {
  if (per === "word") {
    return (
      <motion.span aria-hidden="true" variants={variants} className="inline-block whitespace-pre">
        {segment}
      </motion.span>
    );
  }
  return (
    <span className="inline-block whitespace-pre">
      {graphemes(segment).map((char, index) => (
        <motion.span
          key={`${String(index)}-${char}`}
          aria-hidden="true"
          variants={variants}
          className="inline-block whitespace-pre"
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
});

interface TextEffectProps {
  children: string;
  per?: Per;
  as?: "span" | "p";
  preset?: Preset;
  className?: string;
  /** Seconds before the first piece appears. */
  delay?: number;
  /** Higher is faster. */
  speedReveal?: number;
  speedSegment?: number;
  /** Mounts (and plays) the text when true. */
  trigger?: boolean;
  onAnimationComplete?: () => void;
}

/** Reveals a string piece by piece: word by word, or letter by letter like a streamed reply. */
export function TextEffect({
  children,
  per = "word",
  as = "p",
  preset = "fade",
  className,
  delay = 0,
  speedReveal = 1,
  speedSegment = 1,
  trigger = true,
  onAnimationComplete,
}: TextEffectProps) {
  const MotionTag = as === "span" ? motion.span : motion.p;
  const segments = children.split(/(\s+)/);
  const item: Variants = {
    ...PRESETS[preset],
    visible: { ...PRESETS[preset].visible, transition: { duration: 0.3 / speedSegment } },
  };
  const container: Variants = {
    ...containerVariants,
    visible: {
      opacity: 1,
      transition: { staggerChildren: STAGGER[per] / speedReveal, delayChildren: delay },
    },
  };

  return (
    <AnimatePresence mode="popLayout">
      {trigger && (
        <MotionTag
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={container}
          className={className}
          onAnimationComplete={onAnimationComplete}
        >
          <span className="sr-only">{children}</span>
          {segments.map((segment, index) => (
            <Segment
              key={`${String(index)}-${segment}`}
              segment={segment}
              variants={item}
              per={per}
            />
          ))}
        </MotionTag>
      )}
    </AnimatePresence>
  );
}
