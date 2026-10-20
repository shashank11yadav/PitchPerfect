"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type Parser } from "./api";

export type Loaded<T> =
  { state: "loading" } | { state: "error"; error: unknown } | { state: "ready"; data: T };

interface Result<T> {
  key: string;
  loaded: Loaded<T>;
}

/**
 * GETs `path` on the api for a client view and keeps the answer: loading, error, or ready.
 * A new `path` (or `reload`) starts over; an answer for an older request is ignored. `update`
 * changes the kept data after a write the api has already answered (e.g. a withdrawn application).
 */
export function useApi<T>(path: string, schema?: Parser<T>) {
  const [version, setVersion] = useState(0);
  const key = `${String(version)} ${path}`;
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch<T>(path, { ...(schema && { schema }), signal: controller.signal }).then(
      (data) => {
        setResult({ key, loaded: { state: "ready", data } });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ key, loaded: { state: "error", error } });
      },
    );
    return () => {
      controller.abort();
    };
  }, [key, path, schema]);

  const reload = useCallback(() => {
    setVersion((current) => current + 1);
  }, []);

  const update = useCallback(
    (change: (data: T) => T) => {
      setResult((current) =>
        current?.key === key && current.loaded.state === "ready"
          ? { key, loaded: { state: "ready", data: change(current.loaded.data) } }
          : current,
      );
    },
    [key],
  );

  const loaded: Loaded<T> = result?.key === key ? result.loaded : { state: "loading" };
  return { ...loaded, reload, update };
}
