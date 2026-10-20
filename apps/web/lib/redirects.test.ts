import { describe, expect, it } from "vitest";
import { roleHome, safeNext } from "./redirects";

describe("roleHome", () => {
  it("sends each role to its own dashboard", () => {
    expect(roleHome("student")).toBe("/app");
    expect(roleHome("employer")).toBe("/employer");
  });
});

describe("safeNext", () => {
  it.each([
    ["/app/practice", "student", "/app/practice"],
    ["/app", "student", "/app"],
    ["/app/jobs?page=2#top", "student", "/app/jobs?page=2#top"],
    [
      "/jobs/sales-development-representative-a1b2c3",
      "student",
      "/jobs/sales-development-representative-a1b2c3",
    ],
    [
      "/jobs/sales-development-representative-a1b2c3",
      "employer",
      "/jobs/sales-development-representative-a1b2c3",
    ],
    ["/employer/jobs/new", "employer", "/employer/jobs/new"],
  ] as const)("keeps %s for a %s", (next, role, expected) => {
    expect(safeNext(next, role)).toBe(expected);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["protocol-relative", "//evil.test"],
    ["protocol-relative with a path", "//evil.test/app"],
    ["backslash host", "/\\evil.test"],
    ["backslash later", "/app\\..\\..\\evil"],
    ["absolute URL", "https://evil.test"],
    ["absolute URL to an allowed path", "https://evil.test/app"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,hi"],
    ["encoded slashes", "%2F%2Fevil.test"],
    ["encoded slash inside the path", "/app%2F..%2F..%2Fevil"],
    ["encoded backslash", "/app%5c..%5cevil"],
    ["dot segments out of /app", "/app/../../evil"],
    ["encoded dot segments", "/app/%2e%2e/%2e%2e/evil"],
    ["dot segments into another area", "/app/../employer"],
    ["leading whitespace", " /app"],
    ["tab inside", "/app/\tpractice"],
    ["newline inside", "/app\n/evil"],
    ["a public page", "/about"],
    ["the jobs board without a job", "/jobs"],
    ["a prefix that only looks like /app", "/application"],
    ["the sign-in page itself", "/signin"],
    ["the api", "/api/auth/me"],
  ])("rejects %s (%j) and goes to the role home", (_case, next) => {
    expect(safeNext(next, "student")).toBe("/app");
    expect(safeNext(next, "employer")).toBe("/employer");
  });

  it("doesn't send a role into the other role's area", () => {
    expect(safeNext("/employer/jobs", "student")).toBe("/app");
    expect(safeNext("/app/practice", "employer")).toBe("/employer");
  });

  it("rejects very long values", () => {
    expect(safeNext(`/app/${"a".repeat(2100)}`, "student")).toBe("/app");
  });
});
