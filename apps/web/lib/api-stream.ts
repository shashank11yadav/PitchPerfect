import { PracticeEvent, readSseMessages, type SseMessage } from "@pitchperfect/shared";
import { ApiError, isRecord, send } from "./api";
import { PAGES_EXPORT } from "./pages-export";

/*
 * The practice room's streamed turns, apart from `./api` because validating them needs the shared
 * zod schemas. `./api` is in every page's bundle (the session asks `/auth/me` through it), so
 * keeping the schemas here keeps zod out of the public pages' JavaScript.
 */

/** One SSE message as a `PracticeEvent`: the event name is its type. */
function parseMessage({ event: type, data }: SseMessage): PracticeEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    payload = undefined;
  }
  const parsed = PracticeEvent.safeParse(isRecord(payload) ? { ...payload, type } : undefined);
  if (!parsed.success) {
    throw new ApiError(
      502,
      "upstream_error",
      "The practice partner sent a reply we couldn’t read.",
    );
  }
  return parsed.data;
}

/**
 * POSTs `body` and reads the `text/event-stream` response, calling `onEvent` for each validated
 * event as it arrives. Resolves when the stream ends.
 */
export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: PracticeEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (PAGES_EXPORT) {
    const { demoStream } = await import("./demo/demo-api");
    return demoStream(path, body, onEvent, signal);
  }
  const res = await send(path, { method: "POST", body, signal, accept: "text/event-stream" });
  if (!res.body) return;

  // An event the stream ends without a blank line after still counts. Stopping on an error
  // cancels the stream.
  for await (const message of readSseMessages(res.body, { keepUnterminated: true })) {
    onEvent(parseMessage(message));
  }
}
