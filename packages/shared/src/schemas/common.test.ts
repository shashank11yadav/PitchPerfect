import { describe, expect, it } from "vitest";
import { httpsUrl, objectId, pageQuery } from "./common.js";

describe("httpsUrl", () => {
  it("accepts https URLs", () => {
    expect(httpsUrl().safeParse("https://example.com/path?x=1").success).toBe(true);
  });

  it("rejects http, other schemes, credentials, and junk", () => {
    for (const value of [
      "http://example.com",
      "javascript:alert(1)",
      "ftp://example.com",
      "https://user:pw@example.com",
      "example.com",
      "",
    ]) {
      expect(httpsUrl().safeParse(value).success, value).toBe(false);
    }
  });

  it("rejects URLs longer than 2048 characters", () => {
    expect(httpsUrl().safeParse(`https://example.com/${"a".repeat(2040)}`).success).toBe(false);
  });
});

describe("objectId", () => {
  it("accepts 24 hex characters only", () => {
    expect(objectId().safeParse("507f1f77bcf86cd799439011").success).toBe(true);
    expect(objectId().safeParse("507f1f77bcf86cd79943901").success).toBe(false);
    expect(objectId().safeParse("507f1f77bcf86cd79943901z").success).toBe(false);
  });
});

describe("pageQuery", () => {
  it("defaults to page 1, size 20", () => {
    expect(pageQuery.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("coerces query strings and caps the page size at 50", () => {
    expect(pageQuery.parse({ page: "3", pageSize: "50" })).toEqual({ page: 3, pageSize: 50 });
    expect(pageQuery.safeParse({ pageSize: "51" }).success).toBe(false);
    expect(pageQuery.safeParse({ page: "0" }).success).toBe(false);
    expect(pageQuery.safeParse({ page: "1.5" }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(pageQuery.safeParse({ sort: "x" }).success).toBe(false);
  });
});
