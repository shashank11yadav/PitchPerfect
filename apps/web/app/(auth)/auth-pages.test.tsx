import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import * as forgot from "./forgot-password/page";
import * as reset from "./reset-password/page";
import * as signin from "./signin/page";
import * as signupEmployer from "./signup/employer/page";
import * as signup from "./signup/page";
import * as signupStudent from "./signup/student/page";
import * as verify from "./verify-email/page";
import { queryValue } from "@/lib/search-params";

const PAGES: [string, Metadata][] = [
  ["/signin", signin.metadata],
  ["/signup", signup.metadata],
  ["/signup/student", signupStudent.metadata],
  ["/signup/employer", signupEmployer.metadata],
  ["/verify-email", verify.metadata],
  ["/forgot-password", forgot.metadata],
  ["/reset-password", reset.metadata],
];

describe("auth page metadata", () => {
  it.each(PAGES)("%s is noindex with its own canonical URL", (path, metadata) => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.alternates?.canonical).toEqual(expect.stringMatching(new RegExp(`${path}$`)));
    expect(metadata.description?.length).toBeGreaterThanOrEqual(110);
  });

  it("sends no referrer from the pages that carry an emailed token", () => {
    expect(verify.metadata.referrer).toBe("no-referrer");
    expect(reset.metadata.referrer).toBe("no-referrer");
    expect(signin.metadata.referrer).toBeUndefined();
  });
});

describe("queryValue", () => {
  it("reads one value, the first when repeated", async () => {
    await expect(queryValue(Promise.resolve({ next: "/app" }), "next")).resolves.toBe("/app");
    await expect(queryValue(Promise.resolve({ next: ["/app", "/x"] }), "next")).resolves.toBe(
      "/app",
    );
    await expect(queryValue(Promise.resolve({}), "next")).resolves.toBeUndefined();
  });
});
