import type { PracticePartnerKind } from "@pitchperfect/shared";
import type { LegalSection } from "@/components/marketing/LegalDocument";
import { CONTACT } from "./legal";
import { COPY_LIMITS as L } from "./limits";
import { BROWSER_PARTNER_NOTICE, SCRIPTED_PARTNER_NOTICE } from "./partner-notice";

const AI_PROVIDER = "our AI provider (OpenAI or Anthropic, depending on configuration)";

/** What the scripted partner and the in-browser demo replace in a turn before keeping it. */
const REDACTED =
  "email addresses, phone numbers, card and bank account numbers, and Social Security numbers";

const SPEECH_RECOGNITION =
  "Some browsers recognize speech by sending the audio to their maker (Google, Apple or Microsoft), under that company’s own privacy terms. Where your browser offers on-device recognition, it is used automatically.";

const READ_ALOUD = (
  <p>
    The partner’s replies are read aloud by your browser’s own speech voices. Text mode is always
    available if you would rather not use your microphone.
  </p>
);

/**
 * The privacy policy template. It must match the data flows in docs/security.md, so it depends on
 * which partner is running: a live model behind an AI provider, the scripted persona on our
 * server, or the static demo (docs/deploy.md), which has no server and keeps everything in the tab.
 */
export const privacySections = (partner: PracticePartnerKind): readonly LegalSection[] =>
  partner === "browser" ? DEMO_SECTIONS : appSections(partner);

/** The full app's policy: accounts, a server, a database and an email service. */
const appSections = (partner: "live" | "scripted"): readonly LegalSection[] => [
  {
    id: "summary",
    title: "The short version",
    body: (
      <ul>
        <li>We keep what you give us to run your account, your practice and your applications.</li>
        <li>
          {partner === "live"
            ? `Your practice turns go to ${AI_PROVIDER}, which plays the buyer and scores the session.`
            : SCRIPTED_PARTNER_NOTICE}{" "}
          Transcripts are deleted after {L.retentionDays} days.
        </li>
        <li>
          We never get your audio. Your browser turns speech into text, and only the text reaches
          us. Some browsers send the audio to their own speech service (Google, Apple, or Microsoft)
          to do that.
        </li>
        <li>An employer sees only what you send with an application to their job.</li>
        <li>
          There are four cookies: one keeps you signed in, two protect your forms, and one lets a
          browser you signed in with before keep signing in while someone else is guessing your
          password. We don’t use advertising, analytics or tracking cookies.
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
          receives or stores audio; only the text you choose to send reaches us.{" "}
          {SPEECH_RECOGNITION}
        </p>
        {READ_ALOUD}
      </>
    ),
  },
  {
    id: "processors",
    title: "Who else processes your data",
    body: (
      <ul>
        {partner === "scripted" && (
          <li>
            <strong>No AI provider.</strong> The scripted partner runs on our server. Your practice
            turns are stored with your session, with {REDACTED} replaced by placeholders.
          </li>
        )}
        {partner === "live" && (
          <li>
            <strong>{AI_PROVIDER}</strong> receives the text of your practice turns, the scenario
            and, if you practiced for a job, that job’s title, description and skills. Before
            anything is sent, {REDACTED} are replaced with placeholders. We don’t add your name or
            email address, but anything you say in a session is sent as you said it.
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
          <li>
            <strong>pp.device</strong> is set when you sign in or reset your password. It holds a
            date and a signature, not your email or account, and lasts {L.signinDeviceDays} days.
            After many wrong passwords for your email we pause new sign-ins to it for a while; a
            browser with this cookie can still sign in with the right password.
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
        <li>
          If we suspend a company and its owner deletes the account, a keyed hash of the owner’s
          email address and the company’s verified web domain stay until we lift the hold, so the
          company can’t start over under a new account. No name, email or account is kept.
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
            applicants are told by email. If we suspended your company, a keyed hash of your email
            and the company’s verified domain are kept until we lift the hold.
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
        to their own jobs. Résumés are only ever downloaded, never shown in the browser. The
        practice partner service cannot be reached from the internet. {SECURITY_REPORTS}
      </p>
    ),
  },
  {
    id: "age",
    title: "Age",
    body: (
      <p>
        PitchPerfect is for people 18 or older. Students confirm their age when they sign up, and
        the terms of use require it of everyone. If we learn that an account belongs to someone
        younger, we delete it.
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
        and delete sessions or your whole account. There is no download of your data; ask {CONTACT}{" "}
        if you need a copy.
      </p>
    ),
  },
  CHANGES,
];

const SECURITY_REPORTS = (
  <>
    No system is perfectly secure; if you find a security problem, please report it privately to{" "}
    {CONTACT}, not in a public issue.
  </>
);

const CHANGES: LegalSection = {
  id: "changes",
  title: "Changes and contact",
  body: (
    <p>
      If this policy changes, we will update the date at the top of this page. For questions about
      your data, contact {CONTACT}.
    </p>
  ),
};

/**
 * The static demo's policy. It has no accounts, no server of its own and no cookies: GitHub Pages
 * serves its files, the partner and the scorer run in the tab, and what it remembers lives in the
 * tab's session storage (lib/demo/store.ts), apart from two voice settings in local storage.
 */
const DEMO_SECTIONS: readonly LegalSection[] = [
  {
    id: "summary",
    title: "The short version",
    body: (
      <ul>
        <li>
          This demo has no accounts and no server of ours. GitHub Pages serves its pages, and
          nothing you type is sent anywhere.
        </li>
        <li>{BROWSER_PARTNER_NOTICE}</li>
        <li>
          We never get your audio. Your browser turns speech into text, and some browsers send the
          audio to their own speech service (Google, Apple, or Microsoft) to do that.
        </li>
        <li>There are no cookies, no analytics and no tracking.</li>
      </ul>
    ),
  },
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <p>
        PitchPerfect is open-source software for practicing sales conversations and hiring for
        entry-level sales roles. This site is its demo: the practice room, the lessons and a job
        board of sample listings, without accounts. In this policy, “we” means whoever operates the
        demo. To reach us, contact {CONTACT}.
      </p>
    ),
  },
  {
    id: "what-the-demo-keeps",
    title: "What the demo keeps",
    body: (
      <>
        <p>The demo keeps these in this tab’s session storage, in your browser only:</p>
        <ul>
          <li>
            <strong>Practice sessions:</strong> the skill, the job if you practiced for one, the
            buyer scenario, what you and the partner said, and your scorecard. Before a turn is
            kept, {REDACTED} are replaced with placeholders.
          </li>
          <li>
            <strong>The practice notice:</strong> when you accepted it.
          </li>
          <li>
            <strong>Lessons:</strong> which ones you finished.
          </li>
        </ul>
        <p>
          Your browser deletes all of it when you close the tab, and you can delete any practice
          session from your history before then. If your browser blocks storage, the demo holds them
          in the page instead, and they go when you reload it.
        </p>
        <p>
          Two settings, the partner’s voice and whether it is muted, are kept in your browser’s
          local storage so they last between visits. They never leave your browser, and clearing
          this site’s data removes them.
        </p>
      </>
    ),
  },
  {
    id: "speech",
    title: "Speech and audio",
    body: (
      <>
        <p>
          Voice practice uses your browser’s built-in speech recognition. The demo never receives or
          stores audio, and the text stays in this tab. {SPEECH_RECOGNITION}
        </p>
        {READ_ALOUD}
      </>
    ),
  },
  {
    id: "processors",
    title: "Who else sees your data",
    body: (
      <ul>
        <li>
          <strong>GitHub Pages</strong> hosts the demo. Like any web host, it receives your IP
          address and browser details when it serves a page, under GitHub’s own privacy statement.
          It never receives what you type or say.
        </li>
        <li>
          <strong>Your browser’s speech service</strong>, if your browser uses one for voice
          practice, as described above.
        </li>
        <li>No one else. The demo has no AI provider, email service, database or analytics.</li>
      </ul>
    ),
  },
  {
    id: "cookies",
    title: "Cookies",
    body: (
      <p>
        The demo sets no cookies and loads no third-party scripts. There are no advertising,
        analytics or tracking cookies.
      </p>
    ),
  },
  {
    id: "sample-jobs",
    title: "Sample jobs",
    body: (
      <p>
        The jobs and companies on the demo’s board are samples, made up to show how PitchPerfect
        works. You can’t apply to them, so nothing you do here reaches an employer.
      </p>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: (
      <p>
        The practice partner and the scorer run in your browser tab, so nothing you type to them
        leaves your device, and the site’s content security policy keeps every request the pages
        make on the demo’s own address. {SECURITY_REPORTS}
      </p>
    ),
  },
  CHANGES,
];
