"use client";

import { lazy, Suspense, useSyncExternalStore, type ComponentProps } from "react";
import { prefersReducedMotion } from "@/components/motion/use-entry-reveal";
import { cn } from "@/lib/cn";

// Loaded only in the browser, after the page's text has rendered; the static gradient shows first.
const GrainGradient = lazy(() =>
  import("@paper-design/shaders-react").then((module) => ({ default: module.GrainGradient })),
);

let webGl: boolean | undefined;
function hasWebGl(): boolean {
  webGl ??= Boolean(document.createElement("canvas").getContext("webgl2"));
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

/** Brand blues only: navy ground, primary blue and one lighter tint of it. */
const COLORS = ["#3f56d2", "#6f82e6", "#1d275e"];

/**
 * A slow grain gradient in the brand blues behind its children. Under reduced motion, without
 * WebGL, on the server and while the shader loads, the same field is a static CSS gradient
 * (`.pp-shader-fallback`). Paper Shaders pauses the animation itself while it is off screen or
 * the tab is hidden.
 */
export function ShaderField({ className, children, ...props }: ComponentProps<"div">) {
  const live = useSyncExternalStore(subscribe, canAnimate, serverSnapshot);
  return (
    <div
      {...props}
      data-shader={live ? "live" : "static"}
      className={cn("pp-shader-fallback relative isolate overflow-hidden", className)}
    >
      {live && (
        <Suspense fallback={null}>
          <GrainGradient
            aria-hidden="true"
            className="absolute inset-0 -z-10"
            colorBack="#2d3c90"
            colors={COLORS}
            shape="wave"
            softness={0.85}
            intensity={0.35}
            noise={0.3}
            speed={0.35}
            scale={1.4}
            maxPixelCount={1_200_000}
          />
        </Suspense>
      )}
      {children}
    </div>
  );
}
