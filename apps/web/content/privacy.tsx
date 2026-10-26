import type { PracticePartnerKind } from "@pitchperfect/shared";
import type { LegalSection } from "@/components/marketing/LegalDocument";
import { CONTACT } from "./legal";
import { COPY_LIMITS as L } from "./limits";
import { BROWSER_PARTNER_NOTICE, SCRIPTED_PARTNER_NOTICE } from "./partner-notice";

const AI_PROVIDER = "our AI provider (OpenAI or Anthropic, depending on configuration)";

/**
 * The privacy policy template. It must match the data flows in docs/security.md, so the parts
 * about the practice partner depend on which one is running: a live model behind an AI provider,
 * or the scripted demo persona that never leaves our server.
 */
export const privacySections = (partner: PracticePartnerKind): readonly LegalSection[] => [
  {
    id: "summary",
    title: "The short version",
    body: (
      <ul>
        <li>We keep what you give us to run your account, your practice and your applications.</li>
        <li>
          {partner === "live"
            ? `Your practice turns go to ${AI_PROVIDER}, which plays the buyer and scores the session. Transcripts are deleted after ${L.retentionDays} days.`
            : partner === "scripted"
              ? `${SCRIPTED_PARTNER_NOTICE} Transcripts are deleted after ${L.retentionDays} days.`
              : BROWSER_PARTNER_NOTICE}
        </li>
        <li>
          We never get your audio. Your browser turns speech into text, and only the text reaches
          us. Some browsers send the audio to their own speech service (Google, Apple, or Microsoft)
          to do that.
        </li>
        <li>An employer sees only what you send with an application to their job.</li>
        <li>
          There are three cookies: one keeps you signed in, two protect your forms. We don’t use
          advertising, analytics or tracking cookies.
        </li>
        <li>You can delete any practice session, or your whole account, whenever you like.</li>
      </ul>
    ),
  },
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <p>
        PitchPerfect is open-source software for practicing sales conversations and hiring for
        entry-level sales roles. In this policy, “we” means whoever operates this PitchPerfect site.
        To reach us, contact {CONTACT}.
      </p>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <ul>
        <li>
          <strong>Account:</strong> your name, email address, and whether you are a student or an
          employer. Your password is stored only as a one-way hash. Students also confirm they are
          18 or older, and we record the date they did.
        </li>
        <li>
          <strong>Student profile:</strong> school, major, graduation year, target role, industry,
          state, and which lessons you have finished.
        </li>
        <li>
          <strong>Résumé:</strong> the PDF you upload, up to {L.resumeMegabytes} MB.
        </li>
        <li>
          <strong>Practice sessions:</strong> the skill, the job if you practiced for one, the buyer
          scenario, what you and the partner said, your scorecard, timestamps, and how much{" "}
          {partner === "live" ? "AI " : ""}processing the session used. We also record when you
          accepted the practice notice.
        </li>
        <li>
          <strong>Jobs and applications:</strong> jobs you save, jobs you apply to, the scorecard
          you chose to share, each application’s status, and interview times and links.
        </li>
        <li>
          <strong>Employers:</strong> your job title; your company’s name, website, LinkedIn page,
          pitch and logo link; your job posts; and your notes on applicants’ status.
        </li>
        <li>
          <strong>Technical records:</strong> request logs with an ID, the page or endpoint, the
          result and how long it took. Logs never contain what you typed or said.
        </li>
        <li>
          <strong>Abuse limits:</strong> short-lived counters keyed to your IP address and, for
          sign-in and password resets, your email address. We store a one-way hash of each key,
          never the address itself.
        </li>
      </ul>
    ),
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: (
      <ul>
        <li>To run your account and keep it secure.</li>
        <li>To run practice sessions, score them, and show you your history.</li>
        <li>To send the applications you submit, and the details you share, to that employer.</li>
        <li>To show public job listings and company profiles.</li>
        <li>
          To send account emails: verifying your address, resetting your password, interview
          invitations, and notices when an application you made is closed.
        </li>
        <li>To keep the service working and fair: rate limits, usage limits and abuse checks.</li>
      </ul>
    ),
  },
  {
    id: "speech",
    title: "Speech and audio",
    body: (
      <>
        <p>
          Voice practice uses your browser’s built-in speech recognition. PitchPerfect never
          receives or stores audio; only the text you choose to send reaches us. Some browsers
          recognize speech by sending the audio to their maker (Google, Apple or Microsoft), under
          that company’s own privacy terms. Where your browser offers on-device recognition, it is
          used automatically.
        </p>
        <p>
          The partner’s replies are read aloud by your browser’s own speech voices. Text mode is
          always available if you would rather not use your microphone.
        </p>
      </>
    ),
  },
  {
    id: "processors",
    title: "Who else processes your data",
    body: (
      <ul>
        {partner === "browser" && (
          <li>
            <strong>No one.</strong> The scripted partner and the scorer run in this browser tab,
            and your practice turns stay in the tab, with email addresses, phone numbers, card and
            bank account numbers, and Social Security numbers replaced by placeholders.
          </li>
        )}
        {partner === "scripted" && (
          <li>
            <strong>No AI provider.</strong> The scripted partner runs on our server. Your practice
            turns are stored with your session, with email addresses, phone numbers, card and bank
            account numbers, and Social Security numbers replaced by placeholders.
          </li>
        )}
        {partner === "live" && (
          <li>
            <strong>{AI_PROVIDER}</strong> receives the text of your practice turns, the scenario
            and, if you practiced for a job, that job’s title, description and skills. Before
            anything is sent, email addresses, phone numbers, card and bank account numbers, and
            Social Security numbers are replaced with placeholders. We don’t add your name or email
            address, but anything you say in a session is sent as you said it.
          </li>
        )}
        <li>
          <strong>An email delivery service</strong> sends account and interview emails, so it
          receives your email address and the message.
        </li>
        <li>
          <strong>A breached-password check:</strong> when you choose a password, the first five
          characters of a hash of it are sent to a breached-password lookup service. The password
          itself never leaves our servers.
        </li>
        <li>
          <strong>Our hosting and database providers</strong> store the data described here on our
          behalf.
        </li>
      </ul>
    ),
  },
  {
    id: "employers",
    title: "What employers see",
    body: (
      <>
        <p>
          When you apply to a job, that employer sees your name, school, major, graduation year,
          your résumé if you uploaded one, and the one scorecard you chose to share. They do not see
          your email address or any other practice session.
        </p>
        <p>
          A shared scorecard is a live link, not a copy. If you delete that session, withdraw the
          application, or the session reaches its {L.retentionDays}-day limit, the employer sees
          that it is no longer shared.
        </p>
      </>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <>
        <p>PitchPerfect sets only the cookies it needs to work:</p>
        <ul>
          <li>
            <strong>pp.sid</strong> keeps you signed in. It lasts up to {L.sessionRollingDays} days
            without activity and {L.sessionAbsoluteDays} days at most.
          </li>
          <li>
            <strong>pp.csrf</strong> holds a security token that protects your forms from other
            websites.
          </li>
          <li>
            <strong>pp.aid</strong> is a random ID that ties that security token to your browser
            before you sign in.
          </li>
        </ul>
        <p>There are no advertising, analytics or tracking cookies, and no third-party scripts.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>
          Practice transcripts and scorecards: {L.retentionDays} days, then deleted automatically.
        </li>
        <li>
          Email verification links: {L.verifyHours} hours. Password reset links: {L.resetMinutes}{" "}
          minutes.
        </li>
        <li>
          Rate-limit counters (the hashed IP address and email keys used to stop abuse): from one
          minute to an hour, depending on the action, then deleted automatically.
        </li>
        <li>
          How many practice sessions you started each day, for the daily and monthly limits: until
          the end of that month, then deleted automatically. Deleting a session doesn’t remove it
          from this count.
        </li>
        <li>
          If you delete a student account, that month’s count stays until the month ends, stored
          only under a keyed hash of your email address, never your name, email or account. It is
          then deleted automatically. If you sign up again with the same email that month, your new
          account picks it up.
        </li>
        <li>Everything else: until you delete it or delete your account.</li>
      </ul>
    ),
  },
  {
    id: "deletion",
    title: "Deleting your data",
    body: (
      <>
        <p>
          You can delete any practice session from your history. You can delete your account from
          your settings, and this signs you out everywhere.
        </p>
        <ul>
          <li>
            <strong>Students:</strong> deleting your account removes your account, profile, résumé,
            saved jobs, applications and practice sessions. This month’s count of sessions you
            started is kept until the month ends under a keyed hash of your email, so the practice
            limits still apply if you sign up again.
          </li>
          <li>
            <strong>Employers:</strong> deleting your account removes your account, your company,
            its jobs and its interviews. Open applications to those jobs are closed, and the
            applicants are told by email.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <p>
        Passwords are hashed with argon2id. Sessions use secure, HTTP-only cookies. Every request is
        checked so people can only reach their own data, and employers can only reach applications
        to their own jobs. Résumés are only ever downloaded, never shown in the browser.{" "}
        {partner === "browser"
          ? "In this demo the practice partner runs in your browser tab, so nothing you say to it leaves your device."
          : "The practice partner service cannot be reached from the internet."}{" "}
        No system is perfectly secure; if you find a security problem, please report it privately to{" "}
        {CONTACT}, not in a public issue.
      </p>
    ),
  },
  {
    id: "age",
    title: "Age",
    body: (
      <p>
        PitchPerfect is for people 18 or older. Students confirm their age when they sign up, and
        employers sign up with a work email. If we learn that an account belongs to someone younger,
        we delete it.
      </p>
    ),
  },
  {
    id: "choices",
    title: "Your choices",
    body: (
      <p>
        You can see and change your profile, email address and password in your settings, choose
        whether to share a scorecard each time you apply, practice in text mode instead of voice,
        and delete sessions or your whole account. We don’t offer a download of your data yet; ask{" "}
        {CONTACT} if you need a copy.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        If this policy changes, we will update the date at the top of this page. For questions about
        your data, contact {CONTACT}.
      </p>
    ),
  },
];
