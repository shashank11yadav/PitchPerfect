import { z } from "zod";
import { describe, expect, it } from "vitest";

describe("zod configuration", () => {
  it("runs schemas without eval once the package is imported, so strict CSPs never see a probe", async () => {
    await import("./index.js");
    expect(z.config().jitless).toBe(true);
  });
});
