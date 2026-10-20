"use client";

import { useEffect, useRef, useSyncExternalStore, type ComponentProps } from "react";
import { prefersReducedMotion } from "@/components/motion/use-entry-reveal";
import { cn } from "@/lib/cn";

let webGl: boolean | undefined;
function hasWebGl(): boolean {
  if (webGl === undefined) {
    const probe = document.createElement("canvas").getContext("webgl2");
    webGl = probe !== null;
    // Give the probe's context back at once; browsers cap how many can be open.
    probe?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return webGl;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

/** Animate only with motion allowed and WebGL 2 available. The server always says no. */
const canAnimate = () => !prefersReducedMotion() && hasWebGl();
const serverSnapshot = () => false;

/**
 * A span with a slow grain gradient in the brand blues behind its children. It is a span (the
 * shader mounts its canvas into it), so it can sit inside a heading. Under reduced motion,
 * without WebGL, on the server and while the shader loads, it shows the static CSS gradient
 * (`.pp-shader-fallback`). Paper Shaders pauses the animation itself while it is off screen or
 * the tab is hidden.
 */
export function ShaderField({ className, children, ...props }: ComponentProps<"span">) {
  const live = useSyncExternalStore(subscribe, canAnimate, serverSnapshot);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    // A function, so the check after `await` reads the current value.
    const isCancelled = () => cancelled;
    let dispose: (() => void) | undefined;
    // Loaded after the page's text has rendered.
    import("./grain-gradient")
      .then(async ({ mountGrainGradient }) => {
        if (isCancelled() || !ref.current) return;
        const release = await mountGrainGradient(ref.current);
        if (isCancelled()) release();
        else dispose = release;
      })
      .catch(() => {
        // The static gradient stays; nothing else depends on the shader.
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [live]);

  return (
    <span
      {...props}
      ref={ref}
      data-shader={live ? "live" : "static"}
      className={cn("pp-shader-fallback relative isolate overflow-hidden", className)}
    >
      {children}
    </span>
  );
}
