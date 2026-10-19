import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "../src/logger.js";

function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  return { lines, stream };
}

describe("createLogger", () => {
  it("redacts cookies, authorization, passwords, tokens, and text", () => {
    const { lines, stream } = capture();
    const logger = createLogger("info", stream);

    logger.info({
      req: { headers: { cookie: "pp.sid=session-value", authorization: "Bearer bearer-value" } },
      res: { headers: { "set-cookie": "pp.sid=cookie-value" } },
      body: { password: "password-value", token: "token-value", text: "transcript-value" },
      requestId: "req-1",
    });

    const output = lines.join("");
    for (const secret of [
      "session-value",
      "bearer-value",
      "cookie-value",
      "password-value",
      "token-value",
      "transcript-value",
    ]) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain("req-1");
  });

  it("emits nothing at level silent", () => {
    const { lines, stream } = capture();
    createLogger("silent", stream).error("boom");
    expect(lines).toEqual([]);
  });
});
