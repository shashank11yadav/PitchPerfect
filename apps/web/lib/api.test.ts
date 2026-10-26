import type { PracticeEvent } from "@pitchperfect/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, apiStream, resetCsrf } from "./api";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const apiError = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  json(status, { error: { code, message: `${code} message`, requestId: "req-1", ...extra } });

const csrfResponse = (token: string) => json(200, { csrfToken: token });

const fetchMock = vi.fn<typeof fetch>();

/** The URL, method and headers of the n-th fetch call. */
function call(n: number) {
  const [input, init] = fetchMock.mock.calls[n] ?? [];
  return {
    url: typeof input === "string" ? input : input instanceof URL ? input.href : (input?.url ?? ""),
    method: init?.method ?? "GET",
    headers: new Headers(init?.headers),
    init,
  };
}

beforeEach(() => {
  resetCsrf();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("GETs same-origin /api paths with credentials and no CSRF round trip", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { practicePartner: "live" }));
    await expect(apiFetch("/practice/partner")).resolves.toEqual({ practicePartner: "live" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const { url, method, init, headers } = call(0);
    expect(url).toBe("/api/practice/partner");
    expect(method).toBe("GET");
    expect(init?.credentials).toBe("same-origin");
    expect(headers.has("x-csrf-token")).toBe(false);
  });

  it("validates the response with the given schema", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { n: 1 }));
    const schema = {
      parse: (value: unknown) => {
        if (typeof value !== "object" || value === null || !("n" in value)) throw new Error("bad");
        return { n: Number(value.n) * 2 };
      },
    };
    await expect(apiFetch("/x", { schema })).resolves.toEqual({ n: 2 });
  });

  it("fetches the CSRF token once, caches it, and sends it as x-csrf-token", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok-1"))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(200, { ok: true }));

    await apiFetch("/auth/signin", { method: "POST", body: { email: "a@example.com" } });
    await apiFetch("/auth/forgot-password", { method: "POST", body: { email: "a@example.com" } });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(call(0).url).toBe("/api/auth/csrf");
    expect(call(0).init?.credentials).toBe("same-origin");
    for (const n of [1, 2]) {
      expect(call(n).method).toBe("POST");
      expect(call(n).headers.get("x-csrf-token")).toBe("tok-1");
      expect(call(n).headers.get("content-type")).toBe("application/json");
    }
    expect(call(1).init?.body).toBe(JSON.stringify({ email: "a@example.com" }));
  });

  it("shares one token request between concurrent calls and doesn't cache a failure", async () => {
    fetchMock.mockResolvedValueOnce(apiError(429, "rate_limited"));
    await expect(apiFetch("/auth/signin", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "rate_limited",
    });

    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok"))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await Promise.all([
      apiFetch("/a", { method: "POST", body: {} }),
      apiFetch("/b", { method: "POST", body: {} }),
    ]);
    const csrfCalls = fetchMock.mock.calls.filter(([input]) => input === "/api/auth/csrf");
    expect(csrfCalls).toHaveLength(2);
  });

  it("fetches a new token after resetCsrf()", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok-1"))
      .mockResolvedValueOnce(json(200, { ok: true }))
      .mockResolvedValueOnce(csrfResponse("tok-2"))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await apiFetch("/auth/signin", { method: "POST", body: {} });
    resetCsrf();
    await expect(apiFetch("/auth/signout", { method: "POST" })).resolves.toBeUndefined();

    expect(call(2).url).toBe("/api/auth/csrf");
    expect(call(3).headers.get("x-csrf-token")).toBe("tok-2");
  });

  it("maps an error body to ApiError with status, code, message and fields", async () => {
    fetchMock.mockResolvedValueOnce(apiError(429, "rate_limited"));
    const error = await apiFetch("/jobs").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 429,
      code: "rate_limited",
      message: "rate_limited message",
      fields: {},
    });

    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok"))
      .mockResolvedValueOnce(
        apiError(400, "validation_failed", { fields: { email: "Enter a valid email" } }),
      );
    await expect(apiFetch("/auth/signup", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 400,
      code: "validation_failed",
      fields: { email: "Enter a valid email" },
    });
  });

  it("reads Retry-After in seconds, and ignores it when absent or malformed", async () => {
    const limited = (retryAfter?: string) =>
      new Response(
        JSON.stringify({ error: { code: "rate_limited", message: "Slow down", requestId: "r" } }),
        { status: 429, headers: retryAfter === undefined ? {} : { "retry-after": retryAfter } },
      );
    fetchMock
      .mockResolvedValueOnce(limited("90"))
      .mockResolvedValueOnce(limited())
      .mockResolvedValueOnce(limited("soon"));
    await expect(apiFetch("/jobs")).rejects.toMatchObject({ retryAfterSec: 90 });
    await expect(apiFetch("/jobs")).rejects.toMatchObject({ retryAfterSec: undefined });
    await expect(apiFetch("/jobs")).rejects.toMatchObject({ retryAfterSec: undefined });
  });

  it("maps a body that is not an error envelope to internal_error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(apiFetch("/jobs")).rejects.toMatchObject({ status: 502, code: "internal_error" });
  });

  it("maps a network failure to ApiError network_error and rethrows aborts", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(apiFetch("/jobs")).rejects.toMatchObject({ status: 0, code: "network_error" });

    const abort = new DOMException("aborted", "AbortError");
    fetchMock.mockRejectedValueOnce(abort);
    await expect(apiFetch("/jobs")).rejects.toBe(abort);
  });

  it("refreshes the token and retries once on csrf_failed", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("stale"))
      .mockResolvedValueOnce(apiError(403, "csrf_failed"))
      .mockResolvedValueOnce(csrfResponse("fresh"))
      .mockResolvedValueOnce(json(201, { ok: true }));

    await expect(apiFetch("/auth/signup", { method: "POST", body: {} })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(call(1).headers.get("x-csrf-token")).toBe("stale");
    expect(call(2).url).toBe("/api/auth/csrf");
    expect(call(3).headers.get("x-csrf-token")).toBe("fresh");
  });

  it("gives up after one retry", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("a"))
      .mockResolvedValueOnce(apiError(403, "csrf_failed"))
      .mockResolvedValueOnce(csrfResponse("b"))
      .mockResolvedValueOnce(apiError(403, "csrf_failed"));

    await expect(apiFetch("/auth/signup", { method: "POST", body: {} })).rejects.toMatchObject({
      status: 403,
      code: "csrf_failed",
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("sends FormData as-is without a JSON content type", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok"))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const form = new FormData();
    form.set("name", "value");
    await apiFetch("/me/resume", { method: "PUT", body: form });
    expect(call(1).init?.body).toBe(form);
    expect(call(1).headers.has("content-type")).toBe(false);
  });

  it("rejects paths that could leave the /api prefix", async () => {
    await expect(apiFetch("//evil.example/x")).rejects.toThrow();
    await expect(apiFetch("auth/me")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/** A streaming SSE response whose body arrives in the given chunks. */
function sse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("apiStream", () => {
  it("POSTs with the CSRF token and emits validated events across chunk boundaries", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok"))
      .mockResolvedValueOnce(
        sse([
          'event: delta\ndata: {"text":"Hel',
          'lo"}\n\n: keep-alive\n\nevent: delta\r\ndata: {"text":" there"}\r\n\r\n',
          'event: done\ndata: {"stage":"discovery","turnsLeft":19,"finalText":"Hello there"}\n\n',
        ]),
      );
    const events: PracticeEvent[] = [];
    await apiStream("/practice/sessions/abc/turns", { text: "Hi" }, (e) => events.push(e));

    expect(call(1).url).toBe("/api/practice/sessions/abc/turns");
    expect(call(1).method).toBe("POST");
    expect(call(1).headers.get("x-csrf-token")).toBe("tok");
    expect(call(1).headers.get("accept")).toBe("text/event-stream");
    expect(call(1).init?.body).toBe(JSON.stringify({ text: "Hi" }));
    expect(events).toEqual([
      { type: "delta", text: "Hello" },
      { type: "delta", text: " there" },
      { type: "done", stage: "discovery", turnsLeft: 19, finalText: "Hello there" },
    ]);
  });

  it("treats a CRLF split across chunks as one line break", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok"))
      .mockResolvedValueOnce(
        sse([
          "event: delta\r",
          '\ndata: {"text":"a"}\r\n\r\nevent: delta\r\ndata: {"text":"b"}\r\n\r\n',
        ]),
      );
    const onEvent = vi.fn();
    await apiStream("/practice/sessions/abc/turns", { text: "Hi" }, onEvent);
    expect(onEvent.mock.calls).toEqual([
      [{ type: "delta", text: "a" }],
      [{ type: "delta", text: "b" }],
    ]);
  });

  it("emits an event that has no trailing blank line when the stream ends", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok"))
      .mockResolvedValueOnce(sse(['event: ended\ndata: {"reason":"turn_limit"}']));
    const onEvent = vi.fn();
    await apiStream("/practice/sessions/abc/turns", { text: "Hi" }, onEvent);
    expect(onEvent).toHaveBeenCalledWith({ type: "ended", reason: "turn_limit" });
  });

  it("throws ApiError for an error response before the stream starts", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok"))
      .mockResolvedValueOnce(apiError(409, "conflict"));
    await expect(
      apiStream("/practice/sessions/abc/turns", { text: "Hi" }, vi.fn()),
    ).rejects.toMatchObject({ status: 409, code: "conflict" });
  });

  it("throws upstream_error for an event that fails the PracticeEvent schema", async () => {
    fetchMock
      .mockResolvedValueOnce(csrfResponse("tok"))
      .mockResolvedValueOnce(sse(['event: delta\ndata: {"text":1}\n\n']));
    const onEvent = vi.fn();
    await expect(
      apiStream("/practice/sessions/abc/turns", { text: "Hi" }, onEvent),
    ).rejects.toMatchObject({ code: "upstream_error" });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("passes the abort signal to fetch", async () => {
    fetchMock.mockResolvedValueOnce(csrfResponse("tok")).mockResolvedValueOnce(sse([]));
    const controller = new AbortController();
    await apiStream("/practice/sessions/abc/turns", { text: "Hi" }, vi.fn(), controller.signal);
    expect(call(1).init?.signal).toBe(controller.signal);
  });
});
