import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { checkPassword } from "./password-policy.js";

const EMAIL = { email: "jordan@example.test" };
const STRONG = "violet-harbor-lantern-93";

const sha1 = (value: string) => createHash("sha1").update(value).digest("hex").toUpperCase();

/** A fetch stand-in that answers the HIBP range API with the given lines. */
function rangeResponse(lines: string[]) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(lines.join("\r\n"))));
}

/** A fetch that only settles when its signal aborts, like a server that never answers. */
const hangingFetch = vi.fn<typeof fetch>(
  (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(init.signal?.reason as Error);
      });
    }),
);

describe("checkPassword", () => {
  it("accepts a long, uncommon password", async () => {
    expect(await checkPassword(STRONG, EMAIL, { hibpEnabled: false })).toEqual({ ok: true });
  });

  it("rejects a common password from the local list", async () => {
    expect(await checkPassword("password1234", EMAIL, { hibpEnabled: false })).toEqual({
      ok: false,
      reason: "breached",
    });
  });

  it("matches the local list case-insensitively", async () => {
    expect(await checkPassword("Password1234", EMAIL, { hibpEnabled: false })).toEqual({
      ok: false,
      reason: "breached",
    });
  });

  it("rejects passwords shorter than 12 or longer than 128 characters", async () => {
    expect(await checkPassword("a".repeat(11), EMAIL, { hibpEnabled: false })).toEqual({
      ok: false,
      reason: "too_short",
    });
    expect(await checkPassword("a".repeat(129), EMAIL, { hibpEnabled: false })).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("rejects a password equal to the email, ignoring case and surrounding spaces", async () => {
    const result = await checkPassword(" Jordan@Example.test ", EMAIL, { hibpEnabled: false });
    expect(result).toEqual({ ok: false, reason: "matches_email" });
  });

  describe("with the breached-password API", () => {
    it("sends only the first 5 hash characters, with padding, and finds a matching suffix", async () => {
      const hash = sha1(STRONG);
      const fetch = rangeResponse(["0000000000000000000000000000000000A:0", `${hash.slice(5)}:42`]);

      const result = await checkPassword(STRONG, EMAIL, { hibpEnabled: true, fetch });

      expect(result).toEqual({ ok: false, reason: "breached" });
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = fetch.mock.calls[0] ?? [];
      expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
      expect(new Headers(init?.headers).get("Add-Padding")).toBe("true");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    });

    it("accepts a password whose suffix is absent or only present as zero-count padding", async () => {
      const hash = sha1(STRONG);
      const fetch = rangeResponse([`${hash.slice(5)}:0`, "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3"]);

      expect(await checkPassword(STRONG, EMAIL, { hibpEnabled: true, fetch })).toEqual({
        ok: true,
      });
    });

    it("falls back to the local list when the API times out", async () => {
      const deps = { hibpEnabled: true, fetch: hangingFetch, timeoutMs: 20 };

      expect(await checkPassword("password1234", EMAIL, deps)).toEqual({
        ok: false,
        reason: "breached",
      });
      expect(await checkPassword(STRONG, EMAIL, deps)).toEqual({ ok: true });
      expect(hangingFetch).toHaveBeenCalled();
    });

    it("falls back to the local list on a network error or a non-200 answer", async () => {
      const failing = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("fetch failed")));
      const unavailable = vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("busy", { status: 503 })),
      );

      for (const fetch of [failing, unavailable]) {
        expect(await checkPassword("password1234", EMAIL, { hibpEnabled: true, fetch })).toEqual({
          ok: false,
          reason: "breached",
        });
      }
    });

    it("does not call the API for passwords that fail the length or email rules", async () => {
      const fetch = rangeResponse([]);
      await checkPassword("short", EMAIL, { hibpEnabled: true, fetch });
      await checkPassword(EMAIL.email, EMAIL, { hibpEnabled: true, fetch });
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
