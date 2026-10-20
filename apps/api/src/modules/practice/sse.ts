import type { Response } from "express";
import type { PracticeEvent } from "@pitchperfect/shared";

export interface PracticeStream {
  /** Aborts when the client disconnects before the stream has finished. */
  signal: AbortSignal;
  send(event: PracticeEvent): void;
  /** Ends the response. Safe to call twice. */
  close(): void;
}

const HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  // no-transform: the web's /api proxy would otherwise gzip the stream and hold it until the end.
  "cache-control": "no-store, no-transform",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

/**
 * A signal that aborts when the client disconnects before the response has finished. Call it as
 * early as possible: a client that is already gone aborts it at once.
 */
export function watchDisconnect(res: Response): AbortSignal {
  const controller = new AbortController();
  if (res.destroyed || !res.socket || res.socket.destroyed) {
    controller.abort();
  } else {
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });
  }
  return controller.signal;
}

/** Starts a `text/event-stream` response and flushes its headers at once. */
export function openSse(res: Response, signal: AbortSignal): PracticeStream {
  res.writeHead(200, HEADERS);
  res.flushHeaders();

  const open = () => !res.destroyed && !res.writableEnded;
  return {
    signal,
    send({ type, ...data }) {
      if (open()) res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (open()) res.end();
    },
  };
}
