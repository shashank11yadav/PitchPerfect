import type { ServerResponse } from "node:http";
import { TIMEOUTS, type CoachTurnEvent } from "@pitchperfect/shared";

export const HEARTBEAT_MS = TIMEOUTS.coachHeartbeatMs;

const HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store",
  connection: "keep-alive",
  "x-accel-buffering": "no",
} as const;

export interface SseStream {
  /** Writes one event; resolves once the socket can take more (or has closed). */
  send(event: CoachTurnEvent): Promise<void>;
  /** Stops the heartbeat and ends the response. Safe to call twice. */
  close(): void;
}

/** Resolves on `drain`, or on `close` so a dead socket never leaves a writer waiting. */
function drained(res: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      resolve();
    };
    res.once("drain", done);
    res.once("close", done);
  });
}

/** Starts a `text/event-stream` response on a raw (hijacked) response. */
export function openSse(res: ServerResponse): SseStream {
  const open = () => !res.destroyed && !res.writableEnded;
  res.writeHead(200, HEADERS);

  const heartbeat = setInterval(() => {
    if (open()) res.write(": ping\n\n");
  }, HEARTBEAT_MS);

  return {
    async send(event) {
      if (!open()) return;
      const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
      if (!res.write(frame)) await drained(res);
    },
    close() {
      clearInterval(heartbeat);
      if (open()) res.end();
    },
  };
}
