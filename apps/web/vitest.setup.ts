import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// `server-only` throws outside a React Server Components build; tests import server modules directly.
vi.mock("server-only", () => ({}));

// jsdom lays nothing out, so it has no scrolling to do (node-environment files have no DOM).
if (typeof window !== "undefined") {
  Element.prototype.scrollIntoView = () => undefined;
  window.scrollTo = () => undefined;
}

afterEach(() => {
  cleanup();
});
