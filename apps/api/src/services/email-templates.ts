import { LIMITS, type CompanyVerification } from "@pitchperfect/shared";

export interface EmailContent {
  subject: string;
  text: string;
  html: string;
}

interface Link {
  label: string;
  url: string;
}

interface EmailBody {
  heading: string;
  paragraphs: string[];
  /** Main call to action; shown as a button in html and as a bare link in text. */
  action?: Link;
  /** A second, plainer link under the action. */
  secondary?: Link;
  /** Smaller print under the actions. */
  footnotes?: string[];
}

const BRAND = "PitchPerfect";
const BRAND_BLUE = "#3f56d2";
const BRAND_NAVY = "#2d3c90";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escapes text (and URLs) for html bodies and attribute values. */
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);

/** Subjects can include user text; line breaks there could inject headers. */
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

function render(subject: string, body: EmailBody): EmailContent {
  const { heading, paragraphs, action, secondary, footnotes = [] } = body;
  const text = [
    heading,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...[action, secondary].flatMap((link) => (link ? [`${link.label}: ${link.url}`, ""] : [])),
    ...footnotes.flatMap((note) => [note, ""]),
    `— The ${BRAND} team`,
  ].join("\n");

  const paragraph = (content: string, style = "margin:0 0 16px") =>
    `<p style="${style}">${escapeHtml(content)}</p>`;
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:${BRAND_BLUE};color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${escapeHtml(action.label)}</a></p>` +
      paragraph(
        `If the button doesn't work, copy this link into your browser: ${action.url}`,
        "margin:0 0 16px;font-size:13px;color:#555555;word-break:break-all",
      )
    : "";
  const secondaryLink = secondary
    ? `<p style="margin:0 0 16px"><a href="${escapeHtml(secondary.url)}" style="color:${BRAND_BLUE}">${escapeHtml(secondary.label)}</a></p>`
    : "";
  const html = [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    `<title>${escapeHtml(oneLine(subject))}</title></head>`,
    '<body style="margin:0;padding:24px;background:#f5f6fb;font-family:Arial,Helvetica,sans-serif;color:#1c1f2e">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px">',
    `<p style="margin:0 0 24px;font-size:20px;font-weight:700;color:${BRAND_NAVY}">${BRAND}</p>`,
    `<h1 style="margin:0 0 16px;font-size:22px">${escapeHtml(heading)}</h1>`,
    ...paragraphs.map((content) => paragraph(content)),
    button,
    secondaryLink,
    ...footnotes.map((note) => paragraph(note, "margin:0 0 12px;font-size:13px;color:#555555")),
    paragraph(`— The ${BRAND} team`, "margin:24px 0 0"),
    "</div></body></html>",
  ].join("");

  return { subject: oneLine(subject), text, html };
}

export function verifyEmail(link: string): EmailContent {
  return render(`Verify your ${BRAND} email`, {
    heading: "Confirm your email",
    paragraphs: [
      `Thanks for joining ${BRAND}. Confirm this is your email address to finish setting up your account.`,
    ],
    action: { label: "Verify email", url: link },
    footnotes: [
      `This link works once and expires in ${String(LIMITS.verifyTokenHours)} hours.`,
      `If you didn't create a ${BRAND} account, you can ignore this email.`,
    ],
  });
}

export function resetPassword(link: string): EmailContent {
  return render(`Reset your ${BRAND} password`, {
    heading: "Reset your password",
    paragraphs: ["We got a request to reset your password. Choose a new one with the link below."],
    action: { label: "Reset password", url: link },
    footnotes: [
      `This link works once and expires in ${String(LIMITS.resetTokenMinutes)} minutes. Resetting signs you out everywhere.`,
      "If you didn't ask for this, you can ignore this email. Your password stays the same.",
    ],
  });
}

export function signupAttemptExistingAccount(signinLink: string, resetLink: string): EmailContent {
  return render(`Someone tried to sign up to ${BRAND} with your email`, {
    heading: "You already have an account",
    paragraphs: [
      `Someone just tried to create a ${BRAND} account with this email address. You already have one, so nothing was changed.`,
      "If that was you, sign in instead. Forgot your password? You can reset it.",
    ],
    action: { label: "Sign in", url: signinLink },
    secondary: { label: "Reset your password", url: resetLink },
    footnotes: ["If it wasn't you, you can ignore this email."],
  });
}

/**
 * Sent to an address that already has an account when another account asks to move to it. The
 * person who asked sees the same answer as for a free address and gets nothing.
 */
export function emailChangeToExistingAccount(signinLink: string, resetLink: string): EmailContent {
  return render(`Someone tried to move a ${BRAND} account to your email`, {
    heading: "You already have an account",
    paragraphs: [
      `Someone signed in to another ${BRAND} account asked to change its email address to this one. You already have an account with this address, so nothing was changed.`,
      "If that was you, sign in to this account instead. Forgot its password? You can reset it.",
    ],
    action: { label: "Sign in", url: signinLink },
    secondary: { label: "Reset your password", url: resetLink },
    footnotes: ["If it wasn't you, you can ignore this email. Your account stays as it is."],
  });
}

/** Sent to the previous address after an email change, so a takeover can't go unnoticed. */
export function emailChanged(): EmailContent {
  return render(`Your ${BRAND} email was changed`, {
    heading: "Your email address was changed",
    paragraphs: [
      `The email address on your ${BRAND} account was just changed, so this address no longer receives account email.`,
      "If you made this change, you don't need to do anything.",
      `If you didn't, someone else may have your password. Contact the ${BRAND} team right away.`,
    ],
  });
}

const UTC_DATE_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * The invite says in plain text where the link really goes and whether the company is verified,
 * so a student can tell a real invite from a look-alike before clicking.
 */
export function interviewScheduled(details: {
  jobTitle: string;
  company: string;
  companyVerification: CompanyVerification;
  /** The registrable domain the company's badge vouches for, e.g. "acme-demo.example". */
  companyDomain: string;
  startsAtUtc: Date;
  meetingUrl: string;
}): EmailContent {
  const when = `${UTC_DATE_TIME.format(details.startsAtUtc)} UTC`;
  const host = new URL(details.meetingUrl).hostname;
  const standing =
    details.companyVerification === "verified"
      ? `${details.company} is a verified company on ${BRAND}: it controls ${details.companyDomain}.`
      : `${details.company} is not verified on ${BRAND}.`;
  return render(`Interview scheduled: ${details.jobTitle} at ${details.company}`, {
    heading: "You have an interview",
    paragraphs: [
      `${details.company} invited you to interview for ${details.jobTitle}.`,
      `When: ${when}. Check the time in your own time zone before you join.`,
      `The meeting link opens ${host}.`,
      standing,
    ],
    action: { label: "Join the meeting", url: details.meetingUrl },
    footnotes: [
      `Want a warm-up? Open the job on ${BRAND} and run a practice call for it with the AI practice partner.`,
    ],
  });
}

const LIST = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** One message for all of a student's applications that closed together. */
export function applicationsClosed(details: {
  jobTitles: string[];
  company: string;
}): EmailContent {
  const titles = LIST.format(details.jobTitles);
  const plural = details.jobTitles.length > 1;
  return render(`Applications closed: ${titles}`, {
    heading: plural
      ? "These jobs are no longer taking applications"
      : "This job is no longer taking applications",
    paragraphs: [
      `${details.company} closed applications for ${titles}. Thanks for applying.`,
      `There are more roles on ${BRAND} whenever you're ready.`,
    ],
  });
}
