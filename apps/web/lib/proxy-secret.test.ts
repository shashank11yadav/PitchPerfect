import { afterEach, describe, expect, it, vi } from "vitest";
import { register } from "../instrumentation";
import { proxySecret } from "./proxy-secret";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** Runs the startup hook as the Node.js server does; resolves with the exit code it asked for. */
async function startServer(): Promise<number | undefined> {
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  const exit = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  await register();
  return exit.mock.calls[0]?.[0] as number | undefined;
}

describe("proxySecret", () => {
  it.each([["production"], [""]])(
    "refuses a missing or short secret when NODE_ENV is %j",
    (nodeEnv) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      for (const value of ["", "s".repeat(31)]) {
        vi.stubEnv("PROXY_SHARED_SECRET", value);
        expect(() => proxySecret()).toThrow(/PROXY_SHARED_SECRET is required in production/);
      }
    },
  );

  it("returns the secret in production when it is set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PROXY_SHARED_SECRET", "s".repeat(32));
    expect(proxySecret()).toBe("s".repeat(32));
  });

  it.each([["development"], ["test"]])("leaves it optional when NODE_ENV is %s", (nodeEnv) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("PROXY_SHARED_SECRET", "");
    expect(proxySecret()).toBeUndefined();
    vi.stubEnv("PROXY_SHARED_SECRET", "s".repeat(32));
    expect(proxySecret()).toBe("s".repeat(32));
  });
});

describe("server startup", () => {
  it("exits a production server that has no proxy secret", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PROXY_SHARED_SECRET", "");
    expect(await startServer()).toBe(1);
  });

  it("starts a production server that has one", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("PROXY_SHARED_SECRET", "s".repeat(32));
    expect(await startServer()).toBeUndefined();
  });
});
