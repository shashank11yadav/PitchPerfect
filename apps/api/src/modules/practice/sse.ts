import type { Response } from "express";
import type { Stage } from "@pitchperfect/shared";

/** Why a session stopped taking turns (docs/api.md). */
export type EndedReason = "guard_limit" | "turn_limit" | "expired";

/** What the browser receives from `/turns`; `type` is the event name, the rest is `data`. */
type PracticeEvent =
  | { type: "delta"; text: string }
  | { type: "done"; stage: Stage; turnsLeft: number; finalText: string }
  | { type: "redirect"; text: string }
  | { type: "ended"; reason: EndedReason }
  | { type: "error"; code: string };

export interface PracticeStream {
  /** Aborts when the client disconnects before the stream has finished. */
  signal: AbortSignal;
  send(event: PracticeEvent): void;
  /** Ends the response. Safe to call twice. */
  close(): void;
}

const HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

/** Starts a `text/event-stream` response and flushes its headers at once. */
export function openSse(res: Response): PracticeStream {
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });
  res.writeHead(200, HEADERS);
  res.flushHeaders();

  const open = () => !res.destroyed && !res.writableEnded;
  return {
    signal: controller.signal,
    send({ type, ...data }) {
      if (open()) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (open()) res.end();
    },
  };
}
