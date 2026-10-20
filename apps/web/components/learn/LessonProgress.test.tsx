import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { bodyOf, csrf, errorResponse, jsonResponse, serveApi } from "@/lib/test-api";
import { LessonProgress } from "./LessonProgress";

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("LessonProgress", () => {
  it("starts from the saved state and toggles it with PUT", async () => {
    const sent: unknown[] = [];
    let completed = ["introducing-yourself"];
    serveApi({
      "GET /api/me/lessons": () => jsonResponse({ completed }),
      "GET /api/auth/csrf": csrf,
      "PUT /api/me/lessons/pitching": (init) => {
        const body = bodyOf(init) as { completed: boolean };
        sent.push(body);
        completed = body.completed
          ? ["introducing-yourself", "pitching"]
          : ["introducing-yourself"];
        return jsonResponse({ completed });
      },
    });
    render(<LessonProgress skill="pitching" />);

    const toggle = await screen.findByRole("button", { name: "Mark as done" });
    await waitFor(() => {
      expect(toggle).toBeEnabled();
    });
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-pressed", "true");
    });
    expect(screen.getByRole("status")).toHaveTextContent(/marked as done/i);

    await userEvent.click(toggle);
    await waitFor(() => {
      expect(toggle).toHaveAttribute("aria-pressed", "false");
    });
    expect(sent).toEqual([{ completed: true }, { completed: false }]);
  });

  it("keeps the old state and says so when saving fails", async () => {
    serveApi({
      "GET /api/me/lessons": () => jsonResponse({ completed: [] }),
      "GET /api/auth/csrf": csrf,
      "PUT /api/me/lessons/pitching": () =>
        errorResponse(500, "internal_error", "Something went wrong"),
    });
    render(<LessonProgress skill="pitching" />);
    const toggle = await screen.findByRole("button", { name: "Mark as done" });
    await waitFor(() => {
      expect(toggle).toBeEnabled();
    });
    await userEvent.click(toggle);
    expect(await screen.findByRole("status")).toHaveTextContent(/couldn.t save/i);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});
