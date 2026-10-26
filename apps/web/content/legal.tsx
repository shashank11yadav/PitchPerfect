import { AUTHOR } from "@/lib/site";

/** When the legal templates last changed. */
export const LEGAL_UPDATED = "October 26, 2026";

/** Who the legal pages send people to: the person who built and runs PitchPerfect. */
export const CONTACT = (
  <a href={AUTHOR.github} rel="noopener noreferrer">
    {AUTHOR.name} on GitHub
  </a>
);
