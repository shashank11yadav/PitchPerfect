import { describe, expect, it } from "vitest";
import { HealthResponseSchema } from "./health.js";

describe("HealthResponseSchema", () => {
  it("accepts the api's health body with the practice partner kind", () => {
    const body = { status: "ok", db: "ok", coach: "down", practicePartner: "scripted" };
    expect(HealthResponseSchema.parse(body)).toEqual(body);
  });

  it("rejects an unknown partner kind or a missing one", () => {
    expect(
      HealthResponseSchema.safeParse({ status: "ok", db: "ok", coach: "ok", practicePartner: "ai" })
        .success,
    ).toBe(false);
    expect(HealthResponseSchema.safeParse({ status: "ok", db: "ok", coach: "ok" }).success).toBe(
      false,
    );
  });
});
