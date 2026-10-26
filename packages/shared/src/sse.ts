/**
 * Reading `text/event-stream` bodies: the coach's stream in the api, the api's stream in the
 * browser, and whole bodies in tests and evals. Messages follow the SSE format: lines up to a
 * blank line, `event:` and `data:` fields, comment lines starting with `:`.
 */

/** One server-sent event: its name ("message" when it has none) and its data lines, joined. */
export interface SseMessage {
  event: string;
  data: string;
}

/** CR, LF and CRLF all end a line. */
const toLf = (text: string) => text.replace(/\r\n?/g, "\n");

/** One message (the lines up to a blank line), or null when it has no data, like a heartbeat. */
export function parseSseMessage(block: string): SseMessage | null {
  let event = "message";
  const data: string[] = [];
  for (const line of toLf(block).split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length === 0 ? null : { event, data: data.join("\n") };
}

const messagesIn = (blocks: readonly string[]) =>
  blocks.flatMap((block) => {
    const message = parseSseMessage(block);
    return message ? [message] : [];
  });

/** Every message of a complete body, comments and heartbeats skipped. */
export function parseSseBody(body: string): SseMessage[] {
  return messagesIn(toLf(body).split("\n\n"));
}

export interface ReadSseOptions {
  /**
   * Also yield a last message the stream ends without a blank line after. The SSE format drops
   * it; the browser keeps it, so an `ended` event written without one still arrives.
   */
  keepUnterminated?: boolean;
}

/**
 * Yields each message of a `text/event-stream` body as soon as its blank line arrives. Stopping
 * early, or an error while reading, cancels the stream.
 */
export async function* readSseMessages(
  body: ReadableStream<Uint8Array>,
  { keepUnterminated = false }: ReadSseOptions = {},
): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // A trailing CR may be the first half of a CRLF split across chunks.
      const end = buffer.endsWith("\r") ? buffer.length - 1 : buffer.length;
      const blocks = toLf(buffer.slice(0, end)).split("\n\n");
      buffer = (blocks.pop() ?? "") + buffer.slice(end);
      yield* messagesIn(blocks);
    }
    finished = true;
    buffer += decoder.decode();
    if (keepUnterminated) yield* messagesIn(toLf(buffer).split("\n\n"));
  } finally {
    if (finished) reader.releaseLock();
    else await reader.cancel().catch(() => undefined);
  }
}
