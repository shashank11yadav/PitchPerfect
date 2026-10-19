import { describe, expect, it } from "vitest";
import { CompanyUpdateSchema } from "./employer.js";

describe("CompanyUpdateSchema", () => {
  it("accepts partial updates", () => {
    expect(CompanyUpdateSchema.parse({})).toEqual({});
    expect(
      CompanyUpdateSchema.safeParse({
        name: "Acme",
        website: "https://acme.example",
        linkedinUrl: "https://www.linkedin.com/company/acme",
        pitch: "We make widgets.",
        logoUrl: "https://acme.example/logo.png",
      }).success,
    ).toBe(true);
  });

  it("allows clearing optional URLs with null", () => {
    expect(CompanyUpdateSchema.safeParse({ linkedinUrl: null, logoUrl: null }).success).toBe(true);
  });

  it("enforces https, pitch length, and unknown keys", () => {
    expect(CompanyUpdateSchema.safeParse({ website: "http://acme.example" }).success).toBe(false);
    expect(CompanyUpdateSchema.safeParse({ logoUrl: "http://acme.example/l.png" }).success).toBe(
      false,
    );
    expect(CompanyUpdateSchema.safeParse({ pitch: "p".repeat(1000) }).success).toBe(true);
    expect(CompanyUpdateSchema.safeParse({ pitch: "p".repeat(1001) }).success).toBe(false);
    expect(CompanyUpdateSchema.safeParse({ verification: "verified" }).success).toBe(false);
  });
});
