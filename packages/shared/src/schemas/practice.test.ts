import { describe, expect, it } from "vitest";
import {
  AttemptListQuerySchema,
  ShareScorecardSchema,
  StartPracticeSchema,
  TurnSchema,
} from "./practice.js";

describe("TurnSchema", () => {
  it("counts characters as code points: 1000 emoji pass, 1001 fail", () => {
    expect(TurnSchema.safeParse({ text: "😀".repeat(1000) }).success).toBe(true);
    expect(TurnSchema.safeParse({ text: "😀".repeat(1001) }).success).toBe(false);
  });

  it("normalizes text before validating", () => {
    expect(TurnSchema.parse({ text: "  hello\u0000   there  " })).toEqual({ text: "hello there" });
  });

  it("rejects empty, whitespace-only, and non-string text", () => {
    expect(TurnSchema.safeParse({ text: "" }).success).toBe(false);
    expect(TurnSchema.safeParse({ text: " \t\n " }).success).toBe(false);
    expect(TurnSchema.safeParse({ text: 5 }).success).toBe(false);
  });

  it("rejects unknown keys", () => {
    expect(TurnSchema.safeParse({ text: "hi", role: "partner" }).success).toBe(false);
  });
});

describe("StartPracticeSchema", () => {
  it("requires a known skill and an optional job id", () => {
    expect(StartPracticeSchema.safeParse({ skill: "pitching" }).success).toBe(true);
    expect(
      StartPracticeSchema.safeParse({ skill: "pitching", jobId: "507f1f77bcf86cd799439011" })
        .success,
    ).toBe(true);
    expect(StartPracticeSchema.safeParse({ skill: "juggling" }).success).toBe(false);
    expect(StartPracticeSchema.safeParse({ skill: "pitching", jobId: "x" }).success).toBe(false);
    expect(StartPracticeSchema.safeParse({}).success).toBe(false);
  });
});

describe("ShareScorecardSchema", () => {
  it("accepts an attempt id or null", () => {
    expect(ShareScorecardSchema.safeParse({ attemptId: "507f1f77bcf86cd799439011" }).success).toBe(
      true,
    );
    expect(ShareScorecardSchema.safeParse({ attemptId: null }).success).toBe(true);
    expect(ShareScorecardSchema.safeParse({}).success).toBe(false);
    expect(ShareScorecardSchema.safeParse({ attemptId: "x" }).success).toBe(false);
  });
});

describe("AttemptListQuerySchema", () => {
  it("takes an optional skill with the usual paging", () => {
    expect(AttemptListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(AttemptListQuerySchema.parse({ skill: "pitching", page: "2" })).toEqual({
      skill: "pitching",
      page: 2,
      pageSize: 20,
    });
  });

  it("rejects unknown skills and keys", () => {
    expect(AttemptListQuerySchema.safeParse({ skill: "juggling" }).success).toBe(false);
    expect(AttemptListQuerySchema.safeParse({ status: "active" }).success).toBe(false);
  });
});
