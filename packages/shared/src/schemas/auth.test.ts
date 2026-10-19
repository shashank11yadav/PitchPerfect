import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChangeEmailSchema,
  ChangePasswordSchema,
  DeleteAccountSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  SigninSchema,
  SignupSchema,
  VerifyEmailSchema,
} from "./auth.js";
import { gradYearRange } from "./profile.js";

const student = () => ({
  role: "student" as const,
  firstName: "Ada",
  lastName: "Lovelace-Byron",
  email: "ada@example.edu",
  password: "correct horse battery",
  school: "Example State University",
  major: "Marketing",
  gradYear: 2028,
  targetRole: "Sales development rep",
  industry: "Software",
  state: "MA",
  ageConfirmed: true as const,
});

const employer = () => ({
  role: "employer" as const,
  firstName: "Grace",
  lastName: "Hopper",
  email: "grace@acme.example",
  password: "correct horse battery",
  jobTitle: "Head of talent",
  company: { name: "Acme Widgets", website: "https://acme.example" },
});

describe("SignupSchema", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts valid student and employer signups", () => {
    expect(SignupSchema.safeParse(student()).success).toBe(true);
    expect(SignupSchema.safeParse(employer()).success).toBe(true);
  });

  it("rejects a student without ageConfirmed: true", () => {
    const rest: Record<string, unknown> = student();
    delete rest.ageConfirmed;
    expect(SignupSchema.safeParse(rest).success).toBe(false);
    expect(SignupSchema.safeParse({ ...student(), ageConfirmed: false }).success).toBe(false);
  });

  it("limits gradYear to current-1 … current+6 using the current clock", () => {
    expect(gradYearRange()).toEqual({ min: 2025, max: 2032 });
    for (const year of [2025, 2032]) {
      expect(SignupSchema.safeParse({ ...student(), gradYear: year }).success, String(year)).toBe(
        true,
      );
    }
    for (const year of [2024, 2033, 2028.5]) {
      expect(SignupSchema.safeParse({ ...student(), gradYear: year }).success, String(year)).toBe(
        false,
      );
    }
    vi.setSystemTime(new Date("2030-06-01T00:00:00Z"));
    expect(SignupSchema.safeParse({ ...student(), gradYear: 2024 }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...student(), gradYear: 2029 }).success).toBe(true);
    expect(SignupSchema.safeParse({ ...student(), gradYear: 2036 }).success).toBe(true);
  });

  it("rejects extra keys such as role escalation", () => {
    expect(SignupSchema.safeParse({ ...student(), isAdmin: true }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...employer(), extra: 1 }).success).toBe(false);
    expect(
      SignupSchema.safeParse({ ...employer(), company: { ...employer().company, x: 1 } }).success,
    ).toBe(false);
    expect(SignupSchema.safeParse({ ...student(), role: "admin" }).success).toBe(false);
  });

  it("rejects mixing role fields", () => {
    expect(SignupSchema.safeParse({ ...student(), jobTitle: "Boss" }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...employer(), school: "X" }).success).toBe(false);
  });

  it("requires an https company website and optional https linkedinUrl", () => {
    const http = { ...employer(), company: { name: "Acme", website: "http://acme.example" } };
    expect(SignupSchema.safeParse(http).success).toBe(false);
    const withLinkedin = {
      ...employer(),
      company: { ...employer().company, linkedinUrl: "https://www.linkedin.com/company/acme" },
    };
    expect(SignupSchema.safeParse(withLinkedin).success).toBe(true);
    const badLinkedin = {
      ...employer(),
      company: { ...employer().company, linkedinUrl: "http://www.linkedin.com/company/acme" },
    };
    expect(SignupSchema.safeParse(badLinkedin).success).toBe(false);
  });

  it("enforces the password policy", () => {
    expect(SignupSchema.safeParse({ ...student(), password: "short" }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...student(), password: "a".repeat(11) }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...student(), password: "a".repeat(12) }).success).toBe(true);
    expect(SignupSchema.safeParse({ ...student(), password: "a".repeat(129) }).success).toBe(false);
  });

  it("rejects a password equal to the email", () => {
    const result = SignupSchema.safeParse({
      ...student(),
      email: "longpassword@example.edu",
      password: "LongPassword@Example.edu",
    });
    expect(result.success).toBe(false);
  });

  it("trims and lowercases the email", () => {
    const parsed = SignupSchema.parse({ ...student(), email: "  Ada@Example.EDU " });
    expect(parsed.email).toBe("ada@example.edu");
  });

  it("rejects bad emails and unknown states", () => {
    expect(SignupSchema.safeParse({ ...student(), email: "not-an-email" }).success).toBe(false);
    expect(SignupSchema.safeParse({ ...student(), email: `${"a".repeat(250)}@x.io` }).success).toBe(
      false,
    );
    expect(SignupSchema.safeParse({ ...student(), state: "ZZ" }).success).toBe(false);
  });

  it("validates names", () => {
    for (const name of ["José", "O'Brien", "Anne-Marie", "St. John", "李", "Žofie"]) {
      expect(SignupSchema.safeParse({ ...student(), firstName: name }).success, name).toBe(true);
    }
    for (const name of ["", "   ", "R2D2", "<b>x</b>", "a".repeat(61), "123"]) {
      expect(SignupSchema.safeParse({ ...student(), firstName: name }).success, name).toBe(false);
    }
    expect(SignupSchema.parse({ ...student(), firstName: "  Ada  " })).toMatchObject({
      firstName: "Ada",
    });
  });
});

describe("other auth schemas", () => {
  it("SigninSchema normalizes email and accepts any non-empty password up to 128", () => {
    expect(SigninSchema.parse({ email: " A@B.io ", password: "x" })).toEqual({
      email: "a@b.io",
      password: "x",
    });
    expect(SigninSchema.safeParse({ email: "a@b.io", password: "" }).success).toBe(false);
    expect(SigninSchema.safeParse({ email: "a@b.io", password: "x", remember: true }).success).toBe(
      false,
    );
  });

  it("ForgotPasswordSchema, VerifyEmailSchema, ResetPasswordSchema", () => {
    expect(ForgotPasswordSchema.parse({ email: "A@B.io" })).toEqual({ email: "a@b.io" });
    expect(VerifyEmailSchema.safeParse({ token: "abc123" }).success).toBe(true);
    expect(VerifyEmailSchema.safeParse({ token: "" }).success).toBe(false);
    expect(
      ResetPasswordSchema.safeParse({ token: "abc123", password: "correct horse battery" }).success,
    ).toBe(true);
    expect(ResetPasswordSchema.safeParse({ token: "abc123", password: "short" }).success).toBe(
      false,
    );
  });

  it("account schemas require the current password", () => {
    expect(ChangeEmailSchema.parse({ currentPassword: "x", newEmail: " New@B.io" })).toEqual({
      currentPassword: "x",
      newEmail: "new@b.io",
    });
    expect(ChangeEmailSchema.safeParse({ newEmail: "new@b.io" }).success).toBe(false);
    expect(
      ChangePasswordSchema.safeParse({ currentPassword: "x", newPassword: "short" }).success,
    ).toBe(false);
    expect(
      ChangePasswordSchema.safeParse({ currentPassword: "x", newPassword: "correct horse battery" })
        .success,
    ).toBe(true);
    expect(
      ChangePasswordSchema.safeParse({
        currentPassword: "correct horse battery",
        newPassword: "correct horse battery",
      }).success,
    ).toBe(false);
    expect(DeleteAccountSchema.safeParse({ currentPassword: "x" }).success).toBe(true);
    expect(DeleteAccountSchema.safeParse({}).success).toBe(false);
  });
});
