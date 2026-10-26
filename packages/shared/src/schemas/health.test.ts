import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "./health.js";
import { PracticePartnerResponseSchema } from "./practice.js";

describe("HealthResponseSchema", () => {
  it("accepts the api's liveness body", () => {
    const body = { status: "ok", db: "ok", coach: "down" };
    expect(HealthResponseSchema.parse(body)).toEqual(body);
  });

  it("rejects an unknown dependency status", () => {
    expect(HealthResponseSchema.safeParse({ status: "ok", db: "ok", coach: "slow" }).success).toBe(
      false,
    );
  });
});

describe("PracticePartnerResponseSchema", () => {
  it("accepts the kinds the api reports", () => {
    for (const practicePartner of ["scripted", "live"]) {
      expect(PracticePartnerResponseSchema.parse({ practicePartner })).toEqual({ practicePartner });
    }
  });

  it("rejects the static demo's own kind, an unknown one, or a missing one", () => {
    for (const body of [{ practicePartner: "browser" }, { practicePartner: "ai" }, {}]) {
      expect(PracticePartnerResponseSchema.safeParse(body).success).toBe(false);
    }
  });
});
