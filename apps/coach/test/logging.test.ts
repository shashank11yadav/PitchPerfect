import { signRequest } from "@pitchperfect/shared/hmac";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { buildCoachApp } from "../src/app.js";
import { loadCoachConfig } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { devEnv } from "./helpers/env.js";

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
  it("redacts credentials and text fields", () => {
    const { lines, stream } = capture();
    createLogger("info", stream).info({
      req: { headers: { "x-pp-signature": "signature-value", authorization: "bearer-value" } },
      body: { text: "transcript-value" },
    });
    const output = lines.join("");
    for (const value of ["signature-value", "bearer-value", "transcript-value"]) {
      expect(output).not.toContain(value);
    }
  });
});

describe("request logging", () => {
  it("records id, route, status and duration but never bodies or the signature", async () => {
    const { lines, stream } = capture();
    const config = loadCoachConfig(devEnv({ LOG_LEVEL: "info" }));
    const app = buildCoachApp({ config, logStream: stream });
    const body = JSON.stringify({ studentText: "transcript-value" });
    const headers = signRequest(
      config.COACH_SHARED_SECRET,
      { method: "POST", path: "/v1/plan", body },
      Math.floor(Date.now() / 1000),
    );

    await app.inject({
      method: "POST",
      url: "/v1/plan?q=1",
      headers: { "content-type": "application/json", ...headers },
      payload: body,
    });
    await app.close();

    const output = lines.join("");
    const entry = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((record) => record.msg === "request completed");
    expect(entry).toMatchObject({ method: "POST", route: "/v1/plan", statusCode: 400 });
    expect(entry?.reqId).toEqual(expect.any(String));
    expect(entry?.durationMs).toEqual(expect.any(Number));
    expect(output).not.toContain("transcript-value");
    expect(output).not.toContain(headers["x-pp-signature"]);
    expect(output).not.toContain("q=1");
  });
});
