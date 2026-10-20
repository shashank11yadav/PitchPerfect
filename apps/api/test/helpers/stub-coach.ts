import type { AddressInfo } from "node:net";
import { buildCoachApp, type CoachAppOptions } from "@pitchperfect/coach/app";

interface InjectedFailure {
  status: number;
  code: string;
}

export interface StubCoach {
  /** Base URL of the running coach, e.g. `http://127.0.0.1:53211`. */
  url: string;
  /** Requests received per path (`/v1/plan`, `/v1/turn`, `/v1/score`), signed or not. */
  calls: Map<string, number>;
  /** Answers every request to `path` with this JSON error until `clear()`. */
  fail(path: string, failure: InjectedFailure): void;
  /** Forgets counted calls and injected failures. */
  clear(): void;
  close(): Promise<void>;
}

export const callCount = (stub: Pick<StubCoach, "calls">, path: string) =>
  stub.calls.get(path) ?? 0;

/**
 * The real coach service (fake provider, no network beyond loopback) on an ephemeral port, so
 * api tests exercise the actual HMAC, JSON, and SSE contract.
 */
export async function startStubCoach(sharedSecret: string): Promise<StubCoach> {
  const config: CoachAppOptions["config"] = {
    NODE_ENV: "test",
    HOST: "127.0.0.1",
    PORT: 0,
    LOG_LEVEL: "silent",
    COACH_SHARED_SECRET: sharedSecret,
    COACH_PROVIDER: "fake",
    OPENAI_API_KEY: undefined,
    ANTHROPIC_API_KEY: undefined,
    COACH_MODEL: undefined,
    COACH_SCORING_MODEL: undefined,
    COACH_TIMEOUT_MS: 30_000,
    isProd: false,
  };
  const app = buildCoachApp({ config });
  const calls = new Map<string, number>();
  const failures = new Map<string, InjectedFailure>();

  app.addHook("onRequest", async (request, reply) => {
    const path = request.url.split("?", 1)[0] ?? "";
    calls.set(path, (calls.get(path) ?? 0) + 1);
    const failure = failures.get(path);
    if (failure) {
      await reply.code(failure.status).send({
        error: { code: failure.code, message: "Injected failure", requestId: request.id },
      });
    }
  });

  await app.listen({ port: 0, host: "127.0.0.1" });
  const { port } = app.server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${String(port)}`,
    calls,
    fail(path, failure) {
      failures.set(path, failure);
    },
    clear() {
      calls.clear();
      failures.clear();
    },
    close: () => app.close(),
  };
}
