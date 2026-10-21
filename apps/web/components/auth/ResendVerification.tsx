"use client";

import { useState, type ComponentProps } from "react";
import { Button } from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formMessage } from "@/lib/use-form";

interface ResendVerificationProps {
  /** Where the link goes: the signed-in user's address. */
  email: string;
  size?: ComponentProps<typeof Button>["size"];
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}

/**
 * "Send a new link" for a signed-in user whose address isn't confirmed, and what happened when
 * they pressed it (sent, or how long to wait after the hourly limit).
 */
export function ResendVerification({
  email,
  size = "lg",
  variant = "primary",
  className,
}: ResendVerificationProps) {
  const [sending, setSending] = useState(false);
  const [news, setNews] = useState("");

  async function resend() {
    setSending(true);
    setNews("");
    try {
      await apiFetch("/auth/resend-verification", { method: "POST" });
      setNews(`We sent a new link to ${email}.`);
    } catch (error) {
      setNews(formMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn("flex flex-col items-start gap-3", className)}>
      <Button size={size} variant={variant} loading={sending} onClick={() => void resend()}>
        Send a new link
      </Button>
      <p role="status" className="text-body text-ink empty:sr-only">
        {news}
      </p>
    </div>
  );
}
