import { describe, expect, it } from "vitest";
import { parseSseBody, parseSseMessage, readSseMessages, type SseMessage } from "./sse.js";

/** A byte stream that hands out `chunks` one at a time, and records whether it was cancelled. */
function streamOf(chunks: readonly string[]) {
  const encoder = new TextEncoder();
  const state = { cancelled: false };
  let next = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[next++];
      if (chunk === undefined) controller.close();
      else controller.enqueue(encoder.encode(chunk));
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { body, state };
}

async function readAll(
  chunks: readonly string[],
  options?: Parameters<typeof readSseMessages>[1],
): Promise<SseMessage[]> {
  const messages: SseMessage[] = [];
  for await (const message of readSseMessages(streamOf(chunks).body, options)) {
    messages.push(message);
  }
  return messages;
}

describe("parseSseMessage", () => {
  it("reads the event name and the data", () => {
    expect(parseSseMessage('event: delta\ndata: {"text":"Hi"}')).toEqual({
      event: "delta",
      data: '{"text":"Hi"}',
    });
  });

  it('names an event without an `event:` line "message"', () => {
    expect(parseSseMessage("data: x")).toEqual({ event: "message", data: "x" });
  });

  it("joins data lines with a newline and drops one leading space only", () => {
    expect(parseSseMessage("data: one\ndata:  two\ndata:three")).toEqual({
      event: "message",
      data: "one\n two\nthree",
    });
  });

  it("skips comments and returns null when there is no data", () => {
    expect(parseSseMessage(": ping")).toBeNull();
    expect(parseSseMessage("event: delta")).toBeNull();
    expect(parseSseMessage("")).toBeNull();
    expect(parseSseMessage(": note\ndata: x")).toEqual({ event: "message", data: "x" });
  });

  it("ignores unknown fields and treats CRLF as a line break", () => {
    expect(parseSseMessage("id: 7\r\nretry: 10\r\nevent: done\r\ndata: {}")).toEqual({
      event: "done",
      data: "{}",
    });
  });
});

describe("parseSseBody", () => {
  it("reads every message of a body and skips heartbeats", () => {
    const body = 'event: delta\ndata: {"text":"a"}\n\n: ping\n\nevent: done\ndata: {}\n\n';
    expect(parseSseBody(body)).toEqual([
      { event: "delta", data: '{"text":"a"}' },
      { event: "done", data: "{}" },
    ]);
  });

  it("is empty for an empty body", () => {
    expect(parseSseBody("")).toEqual([]);
  });
});

describe("readSseMessages", () => {
  it("yields messages split across chunks, with heartbeats in between", async () => {
    await expect(
      readAll([
        'event: delta\ndata: {"text":"Hel',
        'lo"}\n\n: keep-alive\n\nevent: done\n',
        "data: {}\n\n",
      ]),
    ).resolves.toEqual([
      { event: "delta", data: '{"text":"Hello"}' },
      { event: "done", data: "{}" },
    ]);
  });

  it("treats a CRLF split across chunks as one line break", async () => {
    await expect(
      readAll([
        "event: delta\r",
        '\ndata: {"text":"a"}\r\n\r\nevent: delta\r\ndata: {"text":"b"}\r\n\r\n',
      ]),
    ).resolves.toEqual([
      { event: "delta", data: '{"text":"a"}' },
      { event: "delta", data: '{"text":"b"}' },
    ]);
  });

  it("decodes a character split across chunks", async () => {
    const bytes = new TextEncoder().encode("data: café\n\n");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 10));
        controller.enqueue(bytes.slice(10));
        controller.close();
      },
    });
    const messages: SseMessage[] = [];
    for await (const message of readSseMessages(body)) messages.push(message);
    expect(messages).toEqual([{ event: "message", data: "café" }]);
  });

  it("drops a last message without a blank line unless asked to keep it", async () => {
    const chunks = ["data: a\n\n", 'event: ended\ndata: {"reason":"turn_limit"}'];
    await expect(readAll(chunks)).resolves.toEqual([{ event: "message", data: "a" }]);
    await expect(readAll(chunks, { keepUnterminated: true })).resolves.toEqual([
      { event: "message", data: "a" },
      { event: "ended", data: '{"reason":"turn_limit"}' },
    ]);
  });

  it("cancels the stream when the reader stops early", async () => {
    const { body, state } = streamOf(["data: a\n\n", "data: b\n\n", "data: c\n\n"]);
    for await (const message of readSseMessages(body)) {
      expect(message.data).toBe("a");
      break;
    }
    expect(state.cancelled).toBe(true);
  });

  it("cancels the stream when the reader throws, and passes the error on", async () => {
    const { body, state } = streamOf(["data: a\n\n", "data: b\n\n"]);
    const read = async () => {
      for await (const message of readSseMessages(body)) throw new Error(message.data);
    };
    await expect(read()).rejects.toThrow("a");
    expect(state.cancelled).toBe(true);
  });

  it("leaves a finished stream alone", async () => {
    const { body, state } = streamOf(["data: a\n\n"]);
    for await (const message of readSseMessages(body)) expect(message.data).toBe("a");
    expect(state.cancelled).toBe(false);
    expect(body.locked).toBe(false);
  });
});
