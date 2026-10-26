import { describe, expect, it } from "vitest";
import {
  applicationsClosed,
  emailChangeToExistingAccount,
  emailChanged,
  interviewScheduled,
  resetPassword,
  signinLimited,
  signupAttemptExistingAccount,
  verifyEmail,
} from "../src/services/email-templates.js";

const VERIFY_LINK = "http://localhost:3000/verify-email?token=abc_DEF-123";
const RESET_LINK = "http://localhost:3000/reset-password?token=abc_DEF-123";

describe("email templates", () => {
  it("verifyEmail links to the verification page in both html and text", () => {
    const email = verifyEmail(VERIFY_LINK);

    expect(email.subject).toMatch(/PitchPerfect/);
    expect(email.text).toContain(VERIFY_LINK);
    expect(email.html).toContain(`href="${VERIFY_LINK}"`);
    expect(email.text).toMatch(/24 hours/);
  });

  it("resetPassword links to the reset page and mentions the 30-minute expiry", () => {
    const email = resetPassword(RESET_LINK);

    expect(email.text).toContain(RESET_LINK);
    expect(email.html).toContain(`href="${RESET_LINK}"`);
    expect(email.text).toMatch(/30 minutes/);
  });

  it("signinLimited links to the reset page and says known browsers still get in", () => {
    const email = signinLimited(RESET_LINK);

    expect(email.text).toContain(RESET_LINK);
    expect(email.html).toContain(`href="${RESET_LINK}"`);
    expect(email.text).toMatch(/15 minutes/);
    expect(email.text).toMatch(/signed in with before can still sign in/);
    expect(email.text).toMatch(/expires in 30 minutes/);
  });

  it("signupAttemptExistingAccount offers sign-in and password reset", () => {
    const email = signupAttemptExistingAccount(
      "http://localhost:3000/signin",
      "http://localhost:3000/forgot-password",
    );

    expect(email.text).toContain("http://localhost:3000/signin");
    expect(email.text).toContain("http://localhost:3000/forgot-password");
    expect(email.html).toContain('href="http://localhost:3000/signin"');
    expect(email.html).toContain('href="http://localhost:3000/forgot-password"');
  });

  it("emailChangeToExistingAccount offers sign-in and password reset, and no verification link", () => {
    const email = emailChangeToExistingAccount(
      "http://localhost:3000/signin",
      "http://localhost:3000/forgot-password",
    );

    expect(email.text).toContain("http://localhost:3000/signin");
    expect(email.text).toContain("http://localhost:3000/forgot-password");
    expect(email.text).toMatch(/nothing was changed/);
    expect(email.text).not.toContain("token=");
    expect(email.subject).not.toMatch(/verify/i);
  });

  it("interviewScheduled shows the job, company, UTC time and meeting link, escaped", () => {
    const email = interviewScheduled({
      jobTitle: "Sales <script>alert(1)</script> rep",
      company: 'Acme & "Demo" Co',
      companyVerification: "verified",
      companyDomain: "acme-demo.example",
      startsAtUtc: new Date("2026-04-07T15:30:00Z"),
      meetingUrl: 'https://meet.example.test/room?a=1&b="2"',
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("Sales &lt;script&gt;alert(1)&lt;/script&gt; rep");
    expect(email.html).toContain("Acme &amp; &quot;Demo&quot; Co");
    expect(email.html).toContain('href="https://meet.example.test/room?a=1&amp;b=&quot;2&quot;"');
    expect(email.text).toContain("Sales <script>alert(1)</script> rep");
    expect(email.text).toContain("15:30 UTC");
    expect(email.text).toContain("April 7, 2026");
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  it("interviewScheduled names the link's host and the company's standing in plain text", () => {
    const invite = (companyVerification: "verified" | "unverified") =>
      interviewScheduled({
        jobTitle: "Account executive",
        company: "Acme Demo Co",
        companyVerification,
        companyDomain: "acme-demo.example",
        startsAtUtc: new Date("2026-04-07T15:30:00Z"),
        meetingUrl: "https://us02web.zoom.us/j/123?pwd=abc",
      });

    const verified = invite("verified");
    expect(verified.text).toContain("The meeting link opens us02web.zoom.us.");
    expect(verified.html).toContain("The meeting link opens us02web.zoom.us.");
    expect(verified.text).toContain(
      "Acme Demo Co is a verified company on PitchPerfect: it controls acme-demo.example.",
    );
    expect(invite("unverified").text).toContain("Acme Demo Co is not verified on PitchPerfect.");
  });

  it("emailChanged tells the old address about the change and carries no link", () => {
    const email = emailChanged();

    expect(email.subject).toMatch(/email.*changed/i);
    expect(email.text).toMatch(/If you didn't, someone else may have your password/);
    expect(email.text).not.toMatch(/https?:\/\//);
    expect(email.html).not.toContain("href=");
  });

  it("applicationsClosed names the job and company", () => {
    const email = applicationsClosed({ jobTitles: ["Account executive"], company: "Acme Demo Co" });

    expect(email.subject).toContain("Account executive");
    expect(email.text).toContain("Acme Demo Co");
    expect(email.html).toContain("Acme Demo Co");
  });

  it("applicationsClosed lists every job in one message", () => {
    const email = applicationsClosed({
      jobTitles: ["Account executive", "Sales intern", "Support lead"],
      company: "Acme Demo Co",
    });

    for (const title of ["Account executive", "Sales intern", "Support lead"]) {
      expect(email.subject).toContain(title);
      expect(email.text).toContain(title);
      expect(email.html).toContain(title);
    }
    expect(email.text).toContain("Account executive, Sales intern, and Support lead");
  });

  it("applicationsClosed escapes every title in html", () => {
    const email = applicationsClosed({
      jobTitles: ["Rep <script>alert(1)</script>", "Intern & <b>co</b>"],
      company: "Acme",
    });

    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>co</b>");
    expect(email.html).toContain("Rep &lt;script&gt;");
    expect(email.html).toContain("Intern &amp; &lt;b&gt;");
  });

  it("keeps line breaks out of subjects built from user text", () => {
    const email = applicationsClosed({
      jobTitles: ["Rep\r\nBcc: x@example.test", "Other"],
      company: "Acme",
    });
    expect(email.subject).not.toMatch(/[\r\n]/);
  });

  describe("user-supplied values", () => {
    const INJECTED = "Acme\n\nACTION NEEDED: confirm at https://evil.example";
    const rendered = () => [
      applicationsClosed({ jobTitles: ["Sales\r\nintern"], company: INJECTED }),
      interviewScheduled({
        jobTitle: "Sales\u2028intern",
        company: INJECTED,
        companyVerification: "verified",
        companyDomain: "acme-demo.example",
        startsAtUtc: new Date("2026-04-07T15:30:00Z"),
        meetingUrl: "https://us02web.zoom.us/j/123",
      }),
    ];

    it("stay on the line they were put on, in text, html and the subject", () => {
      for (const email of rendered()) {
        const lines = email.text.split("\n");
        expect(lines.filter((line) => line.includes("ACTION NEEDED"))).toHaveLength(
          lines.filter((line) => line.includes("Acme")).length,
        );
        expect(lines.some((line) => line.trimStart().startsWith("ACTION NEEDED"))).toBe(false);
        expect(email.text).not.toMatch(/Sales[\r\n\u2028]+intern/);
        expect(email.html).not.toMatch(/[\r\n\u2028]/);
        expect(email.html).not.toMatch(/>\s*ACTION NEEDED/);
        expect(email.subject).not.toMatch(/[\r\n\u2028]/);
      }
    });

    it("never carry a link a mail client could pick out of the text or the html body", () => {
      for (const email of rendered()) {
        for (const body of [email.text, email.html.slice(email.html.indexOf("<body"))]) {
          expect(body).not.toMatch(/https?:\/\/evil/);
          expect(body).not.toMatch(/evil\.example/);
        }
        expect(email.html).not.toMatch(/href="[^"]*evil/);
      }
    });

    it("still read as the words that were typed", () => {
      const [closed] = rendered();
      const visible = (closed?.text ?? "").replaceAll("\u200b", "");
      expect(visible).toContain(
        "Acme ACTION NEEDED: confirm at https://evil.example closed applications for Sales intern.",
      );
    });
  });

  it("brands every email and has an html document", () => {
    for (const email of [verifyEmail(VERIFY_LINK), resetPassword(RESET_LINK)]) {
      expect(email.html).toMatch(/^<!doctype html>/i);
      expect(email.html).toContain("PitchPerfect");
      expect(email.text).toContain("PitchPerfect");
    }
  });
});
