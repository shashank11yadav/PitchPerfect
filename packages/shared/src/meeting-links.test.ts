import { describe, expect, it } from "vitest";
import { isMeetingServiceHost } from "./meeting-links.js";

describe("isMeetingServiceHost", () => {
  it.each([
    "zoom.us",
    "us02web.zoom.us",
    "meet.google.com",
    "teams.microsoft.com",
    "teams.live.com",
    "acme-demo.webex.com",
    "whereby.com",
    "meet.goto.com",
    "meet.jit.si",
    "app.chime.aws",
  ])("accepts %s", (hostname) => {
    expect(isMeetingServiceHost(hostname)).toBe(true);
  });

  it.each([
    "notzoom.us",
    "zoom.us.evil.example",
    "zoom.us.",
    "google.com",
    "docs.google.com",
    "meet.google.com.evil.example",
    "microsoft.com",
    "goto.com",
    "jit.si",
    "",
  ])("refuses %s", (hostname) => {
    expect(isMeetingServiceHost(hostname)).toBe(false);
  });
});
