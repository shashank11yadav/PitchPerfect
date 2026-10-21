"use client";

import { useState } from "react";
import { resetCsrf } from "@/lib/api";
import { useSession } from "@/lib/session";

/**
 * What the credential forms share: after a change the api gives this browser a new session id,
 * and the CSRF token was bound to the old one; then the form starts empty again (a new `round`
 * remounts it) and the outcome is announced.
 */
export function useCredentialChange() {
  const { refresh } = useSession();
  const [round, setRound] = useState(0);
  const [news, setNews] = useState("");

  async function changed(message: string) {
    resetCsrf();
    await refresh();
    setRound((current) => current + 1);
    setNews(message);
  }

  return {
    round,
    news,
    changed,
    clearNews: () => {
      setNews("");
    },
  };
}

/** The announced outcome under a settings form. */
export function SettingsNews({ news }: { news: string }) {
  return (
    <p role="status" className="text-ink empty:sr-only">
      {news}
    </p>
  );
}
