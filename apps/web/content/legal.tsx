import { AUTHOR } from "@pitchperfect/shared";

/**
 * When the legal templates last changed: the day of the last commit to privacy.tsx, terms.tsx or
 * this file. legal.test.ts holds it to git history.
 */
export const LEGAL_UPDATED = "October 26, 2026";

/** Who the legal pages send people to: the person who built and runs PitchPerfect. */
export const CONTACT = (
  <a href={AUTHOR.github} rel="noopener noreferrer">
    {AUTHOR.name} on GitHub
  </a>
);
