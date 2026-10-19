import { describe, expect, it } from "vitest";
import {
  APPLICATION_STATUSES,
  APPLICATION_TRANSITIONS,
  US_STATES,
  canTransition,
} from "./enums.js";

describe("canTransition", () => {
  it("lets employers move applications forward and reject", () => {
    expect(canTransition("applied", "shortlisted", "employer")).toBe(true);
    expect(canTransition("applied", "rejected", "employer")).toBe(true);
    expect(canTransition("shortlisted", "interview", "employer")).toBe(true);
    expect(canTransition("interview", "interview", "employer")).toBe(true);
    expect(canTransition("interview", "hired", "employer")).toBe(true);
    expect(canTransition("interview", "rejected", "employer")).toBe(true);
  });

  it("blocks employer shortcuts and moves out of terminal states", () => {
    expect(canTransition("applied", "interview", "employer")).toBe(false);
    expect(canTransition("applied", "hired", "employer")).toBe(false);
    expect(canTransition("shortlisted", "hired", "employer")).toBe(false);
    expect(canTransition("hired", "rejected", "employer")).toBe(false);
    expect(canTransition("rejected", "shortlisted", "employer")).toBe(false);
    expect(canTransition("withdrawn", "applied", "employer")).toBe(false);
  });

  it("lets students withdraw only while the application is open", () => {
    expect(canTransition("applied", "withdrawn", "student")).toBe(true);
    expect(canTransition("shortlisted", "withdrawn", "student")).toBe(true);
    expect(canTransition("interview", "withdrawn", "student")).toBe(true);
    expect(canTransition("hired", "withdrawn", "student")).toBe(false);
    expect(canTransition("rejected", "withdrawn", "student")).toBe(false);
    expect(canTransition("applied", "shortlisted", "student")).toBe(false);
  });

  it("lets the system close open applications", () => {
    expect(canTransition("applied", "closed", "system")).toBe(true);
    expect(canTransition("shortlisted", "closed", "system")).toBe(true);
    expect(canTransition("interview", "closed", "system")).toBe(true);
    expect(canTransition("hired", "closed", "system")).toBe(false);
    expect(canTransition("withdrawn", "closed", "system")).toBe(false);
    expect(canTransition("applied", "rejected", "system")).toBe(false);
  });

  it("only references real statuses", () => {
    for (const table of Object.values(APPLICATION_TRANSITIONS)) {
      for (const [from, targets] of Object.entries(table)) {
        expect(APPLICATION_STATUSES).toContain(from);
        for (const to of targets) expect(APPLICATION_STATUSES).toContain(to);
      }
    }
  });
});

describe("US_STATES", () => {
  it("has unique two-letter codes and names", () => {
    const codes = US_STATES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(US_STATES.map((s) => s.name)).size).toBe(US_STATES.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
    expect(codes).toContain("MA");
    expect(codes).toContain("DC");
    expect(codes).toHaveLength(51);
  });
});
