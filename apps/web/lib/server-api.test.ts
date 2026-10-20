import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./api";
import { serverApi } from "./server-api";

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const numberSchema = {
  parse(data: unknown) {
    if (typeof data !== "object" || data === null || !("n" in data) || typeof data.n !== "number")
      throw new Error("not a number body");
    return data.n;
  },
};

const lastInit = () => {
  const init = fetchMock.mock.calls.at(-1)?.[1];
  if (!init) throw new Error("fetch was not called");
  return init;
};

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("API_ORIGIN", "http://api.test:4000");
  vi.stubEnv("PROXY_SHARED_SECRET", "");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("serverApi", () => {
  it("fetches the path on API_ORIGIN uncached, with a timeout, and parses with the schema", async () => {
    fetchMock.mockResolvedValue(json({ n: 7 }));
    await expect(serverApi("/api/jobs?page=1", numberSchema)).resolves.toBe(7);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://api.test:4000/api/jobs?page=1");
    const init = lastInit();
    expect(init.cache).toBe("no-store");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(init.headers).has("x-pp-proxy")).toBe(false);
  });

  it("sends the proxy secret when one is configured", async () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "s".repeat(32));
    fetchMock.mockResolvedValue(json({ n: 1 }));
    await serverApi("/api/jobs", numberSchema);
    expect(new Headers(lastInit().headers).get("x-pp-proxy")).toBe("s".repeat(32));
  });

  it("turns an error response into an ApiError with its status and code", async () => {
    fetchMock.mockResolvedValue(
      json({ error: { code: "internal_error", message: "Boom", requestId: "r1" } }, 503),
    );
    const error = await serverApi("/api/jobs", numberSchema).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, code: "internal_error" });
  });

  it("turns a network failure into an ApiError with status 0", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(serverApi("/api/jobs", numberSchema)).rejects.toMatchObject({
      status: 0,
      code: "network_error",
    });
  });

  it("rejects a body that does not match the schema", async () => {
    fetchMock.mockResolvedValue(json({ n: "seven" }));
    await expect(serverApi("/api/jobs", numberSchema)).rejects.toThrow("not a number body");
  });

  it("only accepts api paths", async () => {
    await expect(serverApi("https://elsewhere.test/api", numberSchema)).rejects.toThrow();
    await expect(serverApi("//elsewhere.test/api", numberSchema)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
