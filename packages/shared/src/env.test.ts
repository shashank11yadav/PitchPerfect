import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConfigError, integer, loadConfigOrExit, optional, parseConfig, port } from "./env.js";

const schema = z.object({
  COUNT: integer(3, { min: 0 }),
  LISTEN: port(80),
  NOTE: optional(z.string()),
});

describe("parseConfig", () => {
  it("applies defaults and treats empty strings as unset", () => {
    expect(parseConfig(schema, { COUNT: "", LISTEN: "", NOTE: "" })).toEqual({
      COUNT: 3,
      LISTEN: 80,
      NOTE: undefined,
    });
  });

  it("coerces numbers and enforces bounds", () => {
    expect(parseConfig(schema, { COUNT: "0", LISTEN: "65535" })).toMatchObject({
      COUNT: 0,
      LISTEN: 65535,
    });
    expect(() => parseConfig(schema, { LISTEN: "65536" })).toThrow(ConfigError);
    expect(() => parseConfig(schema, { COUNT: "-1" })).toThrow(ConfigError);
  });

  it("names the failing variable and never echoes its value", () => {
    try {
      parseConfig(schema, { LISTEN: "not-a-port-value" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).message).toContain("LISTEN");
      expect((error as ConfigError).message).not.toContain("not-a-port-value");
    }
  });
});

describe("loadConfigOrExit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the loaded config", () => {
    expect(loadConfigOrExit(() => 42)).toBe(42);
  });

  it("prints the problem to stderr and exits 1 on a configuration error", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    loadConfigOrExit(() => {
      throw new ConfigError(["PORT: nope"]);
    });
    expect(String(write.mock.calls[0]?.[0])).toContain("PORT: nope");
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("hides the details of unexpected errors", () => {
    const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    loadConfigOrExit(() => {
      throw new Error("secret-detail");
    });
    expect(String(write.mock.calls[0]?.[0])).not.toContain("secret-detail");
  });
});
