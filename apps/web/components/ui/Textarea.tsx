"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { CONTROL_CLASSES, useFieldControl } from "./Field";

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  const control = useFieldControl(props);
  return (
    <textarea
      rows={rows}
      {...props}
      {...control}
      className={cn(CONTROL_CLASSES, "min-h-24 py-2.5", className)}
    />
  );
}
