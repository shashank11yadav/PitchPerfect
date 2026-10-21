import { PracticeUnavailableError } from "../../src/errors.js";
import type { CoachClient, CoachHealth, HealthStatus } from "../../src/services/coach-client.js";

/**
 * Coach stand-in for tests that never practice: its health and provider can be changed per test,
 * and every practice call fails as if the coach were down. Practice tests use the real client
 * against `stub-coach.ts` instead.
 */
export class FakeCoachClient implements CoachClient {
  constructor(
    public healthStatus: HealthStatus = "ok",
    public provider = "fake",
  ) {}

  health(): Promise<CoachHealth> {
    return Promise.resolve(
      this.healthStatus === "ok"
        ? { status: "ok", provider: this.provider }
        : { status: "down", provider: undefined },
    );
  }

  plan(): Promise<never> {
    return Promise.reject(new PracticeUnavailableError());
  }

  score(): Promise<never> {
    return Promise.reject(new PracticeUnavailableError());
  }

  turn(): AsyncIterable<never> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new PracticeUnavailableError()),
      }),
    };
  }
}
