import { describe, expect, it } from "vitest";
import { CANARY } from "../guardrails/canary.js";
import { ReplyFilter, splitStageTag } from "./reply-filter.js";

function run(chunks: readonly string[]) {
  const filter = new ReplyFilter();
  const out = chunks.map((chunk) => filter.push(chunk));
  return { out, emitted: out.join(""), filter };
}

describe("ReplyFilter", () => {
  it("passes ordinary text through as it arrives", () => {
    const { out, filter } = run(["Hello there, ", "how is your week going?"]);
    expect(out).toEqual(["Hello there,", " how is your week going?"]);
    expect(filter.text).toBe("Hello there, how is your week going?");
  });

  it("never emits any part of a stage tag, even split across chunks", () => {
    const { emitted, filter } = run(["Sure thing. [", "[sta", "ge:close]", "]"]);
    expect(emitted).toBe("Sure thing. ");
    expect(filter.text).toBe("Sure thing. [[stage:close]]");
  });

  it("holds back a trailing run that could be the start of the canary", () => {
    const { out, emitted, filter } = run([
      `My code is ${CANARY.slice(0, 16)}`,
      `${CANARY.slice(16)} okay`,
    ]);
    expect(out[0]).toBe("My code is pp-canary");
    expect(emitted).not.toContain(CANARY.slice(10, 16));
    expect(filter.leaked).toBe(true);
    expect(emitted).not.toContain(CANARY.slice(16));
  });

  it("emits a hex-looking run once a non-candidate character ends it", () => {
    const { out } = run(["Our big cafe", " deck."]);
    expect(out).toEqual(["Our big", " cafe deck."]);
  });

  it("stays silent after a leak", () => {
    const filter = new ReplyFilter();
    filter.push(`leak ${CANARY} `);
    expect(filter.push("more words.")).toBe("");
  });
});

describe("splitStageTag", () => {
  it("strips the trailing tag and reads the stage", () => {
    expect(splitStageTag("Fine, go ahead. [[stage:pitch]]")).toEqual({
      text: "Fine, go ahead.",
      stage: "pitch",
    });
  });

  it("tolerates spacing and case and uses the last tag", () => {
    expect(splitStageTag("A [[stage:opening]] b [[ Stage : Objection ]]")).toEqual({
      text: "A b",
      stage: "objection",
    });
  });

  it("returns no stage for a missing or unknown tag and drops a cut-off tag", () => {
    expect(splitStageTag("No tag.")).toEqual({ text: "No tag.", stage: undefined });
    expect(splitStageTag("Odd [[stage:lunch]]")).toEqual({ text: "Odd", stage: undefined });
    expect(splitStageTag("Cut off [[stage:obj")).toEqual({ text: "Cut off", stage: undefined });
  });
});
