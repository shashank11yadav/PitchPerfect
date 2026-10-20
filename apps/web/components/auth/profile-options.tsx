import { US_STATES, gradYearRange } from "@pitchperfect/shared";

/** What to say when a student's profile field is left empty, at sign-up and in settings. */
export const STUDENT_FIELD_MESSAGES = {
  school: "Enter your school",
  major: "Enter your major, or “Undecided”",
  gradYear: "Choose your graduation year",
  targetRole: "Enter the kind of role you want",
  industry: "Enter an industry, even a broad one",
  state: "Choose the state you live in",
};

/** A select's choices for graduation year: the range the shared schema accepts this year. */
export function GradYearOptions() {
  const { min, max } = gradYearRange();
  return (
    <>
      <option value="">Choose a year</option>
      {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((year) => (
        <option key={year} value={String(year)}>
          {year}
        </option>
      ))}
    </>
  );
}

/** A select's choices for US state, by name, sending the code. */
export function StateOptions() {
  return (
    <>
      <option value="">Choose a state</option>
      {US_STATES.map(({ code, name }) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </>
  );
}

/** The select gives text; the schema wants a number. */
export const withYear = (input: Record<string, unknown>) => ({
  ...input,
  gradYear: typeof input.gradYear === "string" ? Number(input.gradYear) : input.gradYear,
});
