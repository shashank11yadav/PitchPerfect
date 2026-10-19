import { describe, expect, it } from "vitest";
import { EmployerProfileUpdateSchema, StudentProfileUpdateSchema } from "./profile.js";

describe("profile update schemas", () => {
  it("accept partial updates and trim values", () => {
    expect(StudentProfileUpdateSchema.parse({ school: "  State U " })).toEqual({
      school: "State U",
    });
    expect(EmployerProfileUpdateSchema.parse({ jobTitle: " Recruiter " })).toEqual({
      jobTitle: "Recruiter",
    });
  });

  it("reject email, password, role, and unknown fields", () => {
    for (const extra of [{ email: "a@b.io" }, { password: "x".repeat(12) }, { role: "employer" }]) {
      expect(StudentProfileUpdateSchema.safeParse(extra).success).toBe(false);
      expect(EmployerProfileUpdateSchema.safeParse(extra).success).toBe(false);
    }
  });

  it("do not accept the other role's fields", () => {
    expect(EmployerProfileUpdateSchema.safeParse({ school: "X" }).success).toBe(false);
    expect(StudentProfileUpdateSchema.safeParse({ jobTitle: "X" }).success).toBe(false);
  });

  it("limit free-text fields to 120 characters", () => {
    expect(StudentProfileUpdateSchema.safeParse({ major: "m".repeat(120) }).success).toBe(true);
    expect(StudentProfileUpdateSchema.safeParse({ major: "m".repeat(121) }).success).toBe(false);
    expect(StudentProfileUpdateSchema.safeParse({ major: "  " }).success).toBe(false);
  });
});
