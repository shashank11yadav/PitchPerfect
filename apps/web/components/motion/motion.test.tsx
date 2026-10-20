import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InView, InViewItem } from "./in-view";
import { StreamingText } from "./streaming-text";
import { observeEntries, stubReducedMotion } from "./test-utils";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("InView", () => {
  it("renders its content fully visible on the server, so nothing waits for scripts", () => {
    const html = renderToString(
      <InView>
        <InViewItem>
          <p>Scored on what you said</p>
        </InViewItem>
      </InView>,
    );
    expect(html).toContain("Scored on what you said");
    expect(html).not.toMatch(/opacity:\s*0/);
  });

  it("stays static under reduced motion, even when it starts below the fold", () => {
    stubReducedMotion(true);
    const io = observeEntries();
    render(
      <InView>
        <InViewItem>
          <p>Eight skills</p>
        </InViewItem>
      </InView>,
    );
    expect(io.observed()).toBe(0);
    const section = screen.getByText("Eight skills").closest("[data-reveal]");
    expect(section).toHaveAttribute("data-reveal", "static");
    expect(screen.getByText("Eight skills").parentElement?.style.opacity).not.toBe("0");
  });

  it("leaves content that is already on screen alone, so it never flickers", () => {
    stubReducedMotion(false);
    const io = observeEntries();
    render(
      <InView>
        <p>Above the fold</p>
      </InView>,
    );
    act(() => {
      io.fire({ isIntersecting: true, top: 100 });
    });
    expect(screen.getByText("Above the fold").closest("[data-reveal]")).toHaveAttribute(
      "data-reveal",
      "static",
    );
  });

  it("hides content that starts below the fold, then plays once when it scrolls in", () => {
    stubReducedMotion(false);
    const io = observeEntries();
    render(
      <InView>
        <p>Below the fold</p>
      </InView>,
    );
    const wrapper = screen.getByText("Below the fold").closest("[data-reveal]");
    act(() => {
      io.fire({ isIntersecting: false, top: 2000 });
    });
    expect(wrapper).toHaveAttribute("data-reveal", "waiting");
    act(() => {
      io.fire({ isIntersecting: true, top: 400 });
    });
    expect(wrapper).toHaveAttribute("data-reveal", "play");
    expect(io.disconnected()).toBe(true);
  });
});

describe("StreamingText", () => {
  it("renders the whole line as plain text under reduced motion", () => {
    stubReducedMotion(true);
    render(<StreamingText text="Who on my side would have to set it up?" />);
    const line = screen.getByText("Who on my side would have to set it up?");
    expect(line).toBeVisible();
    expect(line.closest("[aria-hidden]")).toBeNull();
    expect(document.querySelectorAll("[aria-hidden] span")).toHaveLength(0);
  });

  it("keeps the full text readable, and its space reserved, while it streams", () => {
    stubReducedMotion(false);
    const io = observeEntries();
    render(<StreamingText text="Who would set it up?" />);
    act(() => {
      io.fire({ isIntersecting: false, top: 2000 });
    });
    act(() => {
      io.fire({ isIntersecting: true, top: 400 });
    });
    // One readable copy of the line; the animated letters are hidden from assistive tech.
    const readable = screen
      .getAllByText("Who would set it up?")
      .filter((element) => !element.closest("[aria-hidden]"));
    expect(readable).toHaveLength(1);
    expect(document.querySelector("[data-reveal]")).toHaveAttribute("data-reveal", "play");
  });
});
