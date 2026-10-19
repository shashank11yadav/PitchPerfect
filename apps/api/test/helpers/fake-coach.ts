import type { CoachClient, HealthStatus } from "../../src/services/coach-client.js";

/** Coach stand-in whose reported health can be changed per test. */
export class FakeCoachClient implements CoachClient {
  constructor(public healthStatus: HealthStatus = "ok") {}

  health(): Promise<HealthStatus> {
    return Promise.resolve(this.healthStatus);
  }
}
