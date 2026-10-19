import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createHttpCoachClient } from "../src/services/coach-client.js";

let server: Server | undefined;

async function listen(status: number): Promise<string> {
  server = createServer((req, res) => {
    res.statusCode = req.url === "/healthz" ? status : 404;
    res.end("ok");
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (server) {
      server.close(() => {
        resolve();
      });
    } else {
      resolve();
    }
  });
  server = undefined;
});

describe("createHttpCoachClient", () => {
  it("reports ok when /healthz returns 200", async () => {
    const client = createHttpCoachClient(await listen(200));
    expect(await client.health()).toBe("ok");
  });

  it("reports down when /healthz returns an error status", async () => {
    const client = createHttpCoachClient(await listen(503));
    expect(await client.health()).toBe("down");
  });

  it("reports down when the coach is unreachable", async () => {
    const url = await listen(200);
    await new Promise<void>((resolve) => {
      server?.close(() => {
        resolve();
      });
    });
    expect(await createHttpCoachClient(url).health()).toBe("down");
  });
});
