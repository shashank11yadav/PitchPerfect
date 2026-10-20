"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { CONTROL_CLASSES, useFieldControl } from "./Field";

export function Select({ className, ...props }: ComponentProps<"select">) {
  const control = useFieldControl(props);
  return <select {...props} {...control} className={cn(CONTROL_CLASSES, "h-11", className)} />;
}
