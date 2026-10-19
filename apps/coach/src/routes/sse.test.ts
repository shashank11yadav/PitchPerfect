import { EventEmitter } from "node:events";
import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HEARTBEAT_MS, openSse } from "./sse.js";

class FakeResponse extends EventEmitter {
  chunks: string[] = [];
  headers: Record<string, string> = {};
  status = 0;
  writableEnded = false;
  destroyed = false;
  full = false;

  writeHead(status: number, headers: Record<string, string>) {
    this.status = status;
    this.headers = headers;
    return this;
  }

  write(chunk: string) {
    this.chunks.push(chunk);
    return !this.full;
  }

  end() {
    this.writableEnded = true;
    return this;
  }
}

const open = (res: FakeResponse) => openSse(res as unknown as ServerResponse);

afterEach(() => {
  vi.useRealTimers();
});

describe("openSse", () => {
  it("writes event-stream headers and named JSON events", async () => {
    const res = new FakeResponse();
    const sse = open(res);
    await sse.send({ type: "delta", text: "hi" });
    sse.close();
    expect(res.status).toBe(200);
    expect(res.headers).toMatchObject({
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    expect(res.chunks).toEqual(['event: delta\ndata: {"type":"delta","text":"hi"}\n\n']);
    expect(res.writableEnded).toBe(true);
  });

  it("sends a heartbeat comment every 15 seconds until closed", () => {
    vi.useFakeTimers();
    const res = new FakeResponse();
    const sse = open(res);
    expect(HEARTBEAT_MS).toBe(15_000);
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(res.chunks).toEqual([": ping\n\n", ": ping\n\n"]);
    sse.close();
    vi.advanceTimersByTime(HEARTBEAT_MS * 2);
    expect(res.chunks).toHaveLength(2);
  });

  it("waits for drain when the socket buffer is full, and stops when it closes", async () => {
    const res = new FakeResponse();
    res.full = true;
    const sse = open(res);
    let sent = false;
    const pending = sse.send({ type: "delta", text: "a" }).then(() => {
      sent = true;
    });
    await Promise.resolve();
    expect(sent).toBe(false);
    res.emit("drain");
    await pending;
    expect(sent).toBe(true);

    const stuck = sse.send({ type: "delta", text: "b" });
    res.destroyed = true;
    res.emit("close");
    await stuck;
    await sse.send({ type: "delta", text: "c" });
    expect(res.chunks).toHaveLength(2);
    sse.close();
  });
});
