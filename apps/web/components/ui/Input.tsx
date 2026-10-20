"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { CONTROL_CLASSES, useFieldControl } from "./Field";

export function Input({ className, ...props }: ComponentProps<"input">) {
  const control = useFieldControl(props);
  return <input {...props} {...control} className={cn(CONTROL_CLASSES, "h-11", className)} />;
}
