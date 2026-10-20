import type { EvalReport } from "./runner.js";

/** The bar from the design: at least 90% of cases in band, and every adversarial case handled. */
const PASS_RATE_TARGET = 0.9;

export function evalsPassed(report: EvalReport): boolean {
  return (
    report.total > 0 &&
    report.passRate >= PASS_RATE_TARGET &&
    report.adversarialPassed === report.adversarialTotal
  );
}

const pad = (text: string, width: number) => text.padEnd(width);

const expectedText = ({ overallRange, guard }: EvalReport["results"][number]["expected"]) =>
  overallRange ? `${String(overallRange[0])}–${String(overallRange[1])}` : [guard].flat().join("/");

/** A compact table, one row per case, then a summary line. Failure reasons follow their row. */
export function formatReport(report: EvalReport): string {
  const idWidth = Math.max(4, ...report.results.map((r) => r.id.length));
  const rows = report.results.flatMap((r) => [
    [
      pad(r.pass ? "PASS" : "FAIL", 4),
      pad(r.id, idWidth),
      pad(r.kind, 11),
      pad(r.overall === undefined ? "-" : String(r.overall), 7),
      pad(expectedText(r.expected), 9),
      r.guard ?? "-",
    ].join("  "),
    ...r.notes.map((note) => `      - ${note}`),
  ]);
  const header = [
    pad("", 4),
    pad("case", idWidth),
    pad("kind", 11),
    pad("overall", 7),
    pad("expected", 9),
    "guard",
  ]
    .join("  ")
    .trimEnd();
  const rate = String(Math.round(report.passRate * 100));
  const summary =
    `${String(report.passed)}/${String(report.total)} passed (${rate}%), ` +
    `adversarial ${String(report.adversarialPassed)}/${String(report.adversarialTotal)}`;
  return [header, ...rows, "", summary].join("\n");
}
