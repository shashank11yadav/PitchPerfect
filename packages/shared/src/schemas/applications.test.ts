import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApplicationStatusUpdateSchema,
  ApplySchema,
  EmployerApplicationListQuerySchema,
  InterviewSchema,
} from "./applications.js";

describe("ApplySchema", () => {
  it("allows an optional shared attempt id", () => {
    expect(ApplySchema.safeParse({}).success).toBe(true);
    expect(ApplySchema.safeParse({ sharedAttemptId: "507f1f77bcf86cd799439011" }).success).toBe(
      true,
    );
    expect(ApplySchema.safeParse({ sharedAttemptId: "nope" }).success).toBe(false);
    expect(ApplySchema.safeParse({ status: "hired" }).success).toBe(false);
  });
});

describe("ApplicationStatusUpdateSchema", () => {
  it("accepts only statuses an employer can set", () => {
    for (const status of ["shortlisted", "hired", "rejected"]) {
      expect(ApplicationStatusUpdateSchema.safeParse({ status }).success, status).toBe(true);
    }
    // "interview" is set only through the interview endpoint, which carries the slot.
    for (const status of ["applied", "interview", "withdrawn", "closed", "bogus"]) {
      expect(ApplicationStatusUpdateSchema.safeParse({ status }).success, status).toBe(false);
    }
  });
});

describe("InterviewSchema", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires a future ISO time and an https meeting URL", () => {
    const ok = { startsAt: "2026-06-16T15:00:00Z", meetingUrl: "https://meet.example/abc" };
    expect(InterviewSchema.safeParse(ok).success).toBe(true);
    expect(InterviewSchema.safeParse({ ...ok, startsAt: "2026-06-14T15:00:00Z" }).success).toBe(
      false,
    );
    expect(InterviewSchema.safeParse({ ...ok, startsAt: "tomorrow" }).success).toBe(false);
    expect(
      InterviewSchema.safeParse({ ...ok, meetingUrl: "http://meet.example/abc" }).success,
    ).toBe(false);
  });
});

describe("EmployerApplicationListQuerySchema", () => {
  it("filters by status and saved, reading saved from a query string", () => {
    expect(EmployerApplicationListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(
      EmployerApplicationListQuerySchema.parse({ status: "interview", saved: "true" }),
    ).toMatchObject({ status: "interview", saved: true });
    expect(EmployerApplicationListQuerySchema.parse({ saved: "false" }).saved).toBe(false);
  });

  it("rejects unknown statuses and non-boolean saved values", () => {
    expect(EmployerApplicationListQuerySchema.safeParse({ status: "nope" }).success).toBe(false);
    expect(EmployerApplicationListQuerySchema.safeParse({ saved: "yes" }).success).toBe(false);
  });
});
