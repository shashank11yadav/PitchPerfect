import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { CoachScoreRequest, CoachTurnEvent, CoachTurnRequest } from "@pitchperfect/shared";
import { signRequest } from "@pitchperfect/shared/hmac";
import { PracticeUnavailableError, UpstreamError } from "../src/errors.js";
import { createHttpCoachClient, NotEnoughTurnsError } from "../src/services/coach-client.js";

const SECRET = "dev-only-coach-shared-secret-for-tests-0000000";

type Handler = (req: IncomingMessage, body: string, res: ServerResponse) => void;

let server: Server | undefined;

async function listen(handler: Handler): Promise<string> {
  server = createServer((req, res) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      body += chunk;
    });
    req.on("end", () => {
      handler(req, body, res);
    });
  });
  await new Promise<void>((resolve) => {
    server?.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
}

const clientFor = (url: string) =>
  createHttpCoachClient({ COACH_URL: url, COACH_SHARED_SECRET: SECRET });

function closeServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    server.closeAllConnections();
    server.close(() => {
      resolve();
    });
    server = undefined;
  });
}

afterEach(closeServer);

const respond = (status: number, body: unknown): Handler => {
  return (_req, _body, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
};

const turnRequest: CoachTurnRequest = {
  skill: "pitching",
  scenarioPublic: {
    personaName: "Rowan",
    personaTitle: "Buyer",
    companyType: "A small bakery chain",
    personality: "Busy",
    openingLine: "Hi, Rowan here.",
  },
  scenarioPrivate: { hiddenObjections: ["Price", "Timing"], winConditions: ["Asks a question"] },
  transcript: [],
  studentText: "Hello",
};

const scoreRequest: CoachScoreRequest = {
  skill: "pitching",
  scenarioPublic: turnRequest.scenarioPublic,
  scenarioPrivate: turnRequest.scenarioPrivate,
  transcript: [{ role: "student", text: "Hello" }],
};

async function collect(events: AsyncIterable<CoachTurnEvent>): Promise<CoachTurnEvent[]> {
  const out: CoachTurnEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const usage = { provider: "fake", model: "fake", inputTokens: 3, outputTokens: 2 } as const;

describe("createHttpCoachClient: health", () => {
  it("reports ok and the provider when /healthz returns 200", async () => {
    const client = clientFor(await listen(respond(200, { status: "ok", provider: "fake" })));
    expect(await client.health()).toEqual({ status: "ok", provider: "fake" });
  });

  it("reports ok with no provider when /healthz doesn't name one", async () => {
    const client = clientFor(await listen(respond(200, { status: "ok" })));
    expect(await client.health()).toEqual({ status: "ok", provider: undefined });
  });

  it("reports down when /healthz returns an error status", async () => {
    const client = clientFor(await listen(respond(503, { provider: "fake" })));
    expect(await client.health()).toEqual({ status: "down", provider: undefined });
  });

  it("reports down when the coach is unreachable", async () => {
    const url = await listen(respond(200, {}));
    await closeServer();
    expect(await clientFor(url).health()).toEqual({ status: "down", provider: undefined });
  });
});

describe("createHttpCoachClient: practice calls", () => {
  it("signs the exact body it sends", async () => {
    let seen: { headers: IncomingMessage["headers"]; body: string; url?: string } | undefined;
    const url = await listen((req, body, res) => {
      seen = { headers: req.headers, body, url: req.url };
      respond(400, { error: { code: "not_enough_turns" } })(req, body, res);
    });

    await expect(clientFor(url).score(scoreRequest)).rejects.toBeInstanceOf(NotEnoughTurnsError);

    expect(seen?.url).toBe("/v1/score");
    expect(seen?.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(seen?.body ?? "")).toEqual(scoreRequest);
    const timestamp = Number(seen?.headers["x-pp-timestamp"]);
    const expected = signRequest(
      SECRET,
      { method: "POST", path: "/v1/score", body: seen?.body ?? "" },
      timestamp,
    );
    expect(seen?.headers["x-pp-signature"]).toBe(expected["x-pp-signature"]);
  });

  it("maps 503 practice_unavailable to PracticeUnavailableError", async () => {
    const url = await listen(respond(503, { error: { code: "practice_unavailable" } }));
    await expect(clientFor(url).score(scoreRequest)).rejects.toBeInstanceOf(
      PracticeUnavailableError,
    );
  });

  it("maps other failures and malformed responses to UpstreamError", async () => {
    const failing = await listen(respond(500, { error: { code: "internal" } }));
    await expect(clientFor(failing).score(scoreRequest)).rejects.toBeInstanceOf(UpstreamError);
    await closeServer();

    const malformed = await listen(respond(200, { scorecard: { overall: "great" }, usage }));
    await expect(clientFor(malformed).score(scoreRequest)).rejects.toBeInstanceOf(UpstreamError);
  });

  it("maps an unreachable coach to UpstreamError", async () => {
    const url = await listen(respond(200, {}));
    await closeServer();
    await expect(clientFor(url).score(scoreRequest)).rejects.toBeInstanceOf(UpstreamError);
  });

  it("parses SSE frames split across chunks and skips heartbeats", async () => {
    const done = { type: "done", stage: "discovery", finalText: "Go on.", usage };
    const url = await listen((_req, _body, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(": ping\n\n");
      res.write('event: delta\ndata: {"type":"delta",');
      res.write('"text":"Go"}\n\nevent: done\n');
      res.end(`data: ${JSON.stringify(done)}\n\n`);
    });

    const events = await collect(clientFor(url).turn(turnRequest, new AbortController().signal));

    expect(events).toEqual([{ type: "delta", text: "Go" }, done]);
  });

  it("rejects an event that does not match the contract", async () => {
    const url = await listen((_req, _body, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end('event: ended\ndata: {"type":"ended","reason":"turn_limit"}\n\n');
    });

    await expect(
      collect(clientFor(url).turn(turnRequest, new AbortController().signal)),
    ).rejects.toBeInstanceOf(UpstreamError);
  });

  it("stops with the caller's abort reason when the caller aborts", async () => {
    const url = await listen((_req, _body, res) => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('event: delta\ndata: {"type":"delta","text":"Go"}\n\n');
    });
    const controller = new AbortController();
    const reason = new Error("client left");

    const events = clientFor(url).turn(turnRequest, controller.signal);
    const iterator = events[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toEqual({ type: "delta", text: "Go" });
    controller.abort(reason);

    await expect(iterator.next()).rejects.toBe(reason);
  });
});
