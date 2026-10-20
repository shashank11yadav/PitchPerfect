import type { ReactNode } from "react";
import { Logo } from "./Logo";

interface StatusMessageProps {
  title: string;
  description: string;
  /** Buttons or links for what to do next. */
  children: ReactNode;
}

/** A full-page message for "not found" and error states. */
export function StatusMessage({ title, description, children }: StatusMessageProps) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh max-w-content flex-col items-center justify-center gap-6 px-4 py-20 text-center"
    >
      <Logo />
      <h1 className="text-h2 md:text-h1">{title}</h1>
      <p className="max-w-prose text-ink">{description}</p>
      <div className="flex flex-wrap justify-center gap-3">{children}</div>
    </main>
  );
}
