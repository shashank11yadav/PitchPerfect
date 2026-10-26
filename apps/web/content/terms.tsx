import type { PracticePartnerKind } from "@pitchperfect/shared";
import type { LegalSection } from "@/components/marketing/LegalDocument";
import { CONTACT } from "./legal";
import { COPY_LIMITS as L } from "./limits";

/** The terms of use template; the partner section matches whichever partner is running. */
export const termsSections = (partner: PracticePartnerKind): readonly LegalSection[] => [
  {
    id: "about",
    title: "About these terms",
    body: (
      <p>
        These terms apply when you use this PitchPerfect site. “We” means whoever operates it. By
        creating an account you agree to these terms and to the privacy policy.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use PitchPerfect",
    body: (
      <ul>
        <li>You must be 18 or older.</li>
        <li>An account is for one person. Keep your details accurate and your password private.</li>
        <li>
          Employers must be allowed to hire on behalf of the company they list, and should use an
          address at that company; otherwise the company shows as unverified until we approve it.
        </li>
      </ul>
    ),
  },
  {
    id: "practice-partner",
    title: partner === "live" ? "The AI practice partner" : "The practice partner",
    body: (
      <>
        <p>
          {partner === "live"
            ? "The practice partner is an AI, not a person."
            : partner === "scripted"
              ? "The practice partner is scripted, not a person. It runs on our server and picks its lines from a fixed set."
              : "The practice partner is scripted, not a person. In this demo it runs in your browser and picks its lines from a fixed set."}{" "}
          The buyers it plays, and the companies they work for, are invented. Its replies and
          scorecards are generated automatically and can be wrong. Treat them as practice feedback,
          not as professional, legal or career advice, and not as a prediction of any hiring
          decision.
        </p>
        <p>
          Each session is capped at {L.turns} of your turns, {L.minutes} minutes, and {L.characters}{" "}
          characters per turn. There are also daily and monthly limits on how many sessions you can
          start. Please keep sessions about sales practice. Don’t try to make the partner reveal its
          instructions, play a different role, or produce harmful content. Sessions that keep going
          off track are ended.
        </p>
      </>
    ),
  },
  {
    id: "your-content",
    title: "Your content",
    body: (
      <p>
        You keep ownership of what you add: your profile, résumé, practice turns, job posts and
        company details. You allow us to store and process it to run the service
        {partner === "live" ? ", including sending practice text to our AI provider" : ""}, and to
        show it to the people you choose: employers you apply to, or, for job posts and company
        profiles, the public.
      </p>
    ),
  },
  {
    id: "employers",
    title: "Job posts and employers",
    body: (
      <ul>
        <li>Post real, open roles with an honest description and the actual pay.</li>
        <li>Never charge candidates a fee, or ask them for payment or bank details.</li>
        <li>Follow employment and anti-discrimination law in your posts and your decisions.</li>
        <li>
          Links in posts and company profiles must be secure (https). Use applicant information only
          to consider them for your role.
        </li>
        <li>
          A verified badge means your work email matches your company’s website. Changing the
          company’s name or moving its website to another domain removes the badge until we approve
          the company again. It is not an endorsement. We may suspend a company, which hides its
          jobs everywhere.
        </li>
      </ul>
    ),
  },
  {
    id: "applications",
    title: "Applications and hiring",
    body: (
      <p>
        PitchPerfect connects candidates and employers but is not part of any hiring decision or
        employment relationship. We don’t guarantee interviews, offers or the accuracy of job posts.
        Employers decide who they shortlist, interview and hire.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <ul>
        <li>No harassment, hate, or sexual or violent content.</li>
        <li>No impersonating people or companies, and no misleading job posts.</li>
        <li>No scraping, automated sign-ups, or attempts to get around limits or security.</li>
        <li>No uploading malware or files that are not what they claim to be.</li>
      </ul>
    ),
  },
  {
    id: "ending",
    title: "Ending your account",
    body: (
      <p>
        You can delete your account at any time in your settings; the privacy policy explains what
        is removed. We may suspend or close accounts that break these terms or put other people at
        risk.
      </p>
    ),
  },
  {
    id: "disclaimers",
    title: "Disclaimers and liability",
    body: (
      <p>
        PitchPerfect is provided as it is, without warranties of any kind, and may change or stop.
        To the extent the law allows, we are not liable for indirect losses, or for decisions made
        by employers or candidates using the service.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        If these terms change, we will update the date at the top of this page. Questions go to{" "}
        {CONTACT}.
      </p>
    ),
  },
];
