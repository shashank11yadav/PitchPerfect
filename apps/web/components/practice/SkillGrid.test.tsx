import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pageOf } from "@/components/student/test-fixtures";
import { errorResponse, jsonResponse, serveApi } from "@/lib/test-api";
import { PracticeOverview } from "./SkillGrid";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PracticeOverview", () => {
  it("still lists the skills when lesson progress can't load, and says so", async () => {
    serveApi({
      "GET /api/me/lessons": () => errorResponse(500, "internal_error", "Something went wrong"),
      "GET /api/practice/attempts?pageSize=50": () => jsonResponse(pageOf([])),
      "GET /api/practice/quota": () => errorResponse(500, "internal_error", "Something went wrong"),
    });
    render(<PracticeOverview />);
    expect(await screen.findByText(/couldn.t load your lesson progress/)).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(8);
    expect(screen.queryByText("Lesson read")).toBeNull();
  });
});
