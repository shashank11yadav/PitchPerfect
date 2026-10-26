import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import type { PublicCompany, PublicJob, PublicJobSummary } from "@pitchperfect/shared";
import { Company } from "../src/db/models/index.js";
import { runAdmin, type AdminIo } from "../src/scripts/run-admin.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent, withCsrf, type CsrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import {
  createApplication,
  createEmployer,
  createJob,
  createStudent,
  signIn,
} from "./helpers/factories.js";
import { employerSession } from "./helpers/sessions.js";

useTestDb();

const { app, mailer } = makeTestApp();

afterEach(() => {
  mailer.sent.length = 0;
});

const OWNER_EMAIL = "boss@acme-demo.example";
const SAME_DOMAIN_EMAIL = "hiring@acme-demo.example";
const quiet: AdminIo = { out: () => undefined, err: () => undefined };

const companyOf = (res: { body: unknown }) => (res.body as { company: PublicCompany }).company;
const stored = async (id: unknown) => Company.findById(id).lean();

/**
 * Moves the session's account to `newEmail` and follows the link sent there. Returns the session
 * with a fresh CSRF token, since the change starts a new session.
 */
async function changeEmailAndConfirm(
  session: CsrfAgent,
  password: string,
  newEmail: string,
): Promise<CsrfAgent> {
  await session
    .post("/api/me/change-email")
    .send({ currentPassword: password, newEmail })
    .expect(200);
  const token = /token=([\w-]+)/.exec(
    mailer.sent.find((message) => message.to === newEmail)?.text ?? "",
  )?.[1];
  expect(token).toBeDefined();
  await (await csrfAgent(app)).post("/api/auth/verify-email").send({ token }).expect(200);
  return withCsrf(session.agent);
}

describe("a company that lost its badge", () => {
  it("stays unverified after a rename, through an email change on the same domain, its link and a new sign-in", async () => {
    const { session, password, company } = await employerSession(app, { email: OWNER_EMAIL });

    const renamed = await session.patch("/api/employer/company").send({ name: "Google LLC" });
    expect(companyOf(renamed).verification).toBe("unverified");
    expect(await stored(company._id)).toMatchObject({ verificationLockedReason: "renamed" });

    await changeEmailAndConfirm(session, password, SAME_DOMAIN_EMAIL);
    await signIn(request.agent(app), SAME_DOMAIN_EMAIL, password);

    expect(await stored(company._id)).toMatchObject({
      name: "Google LLC",
      verification: "unverified",
      verificationLockedReason: "renamed",
    });
  });

  it("stays unverified after its website moves away and back, through a confirmed email change", async () => {
    const { session, password, company } = await employerSession(app, { email: OWNER_EMAIL });

    await session
      .patch("/api/employer/company")
      .send({ website: "https://elsewhere-demo.example" })
      .expect(200);
    expect(await stored(company._id)).toMatchObject({
      verification: "unverified",
      verificationLockedReason: "domain_changed",
    });
    await session
      .patch("/api/employer/company")
      .send({ website: "https://www.acme-demo.example" })
      .expect(200);
    await changeEmailAndConfirm(session, password, SAME_DOMAIN_EMAIL);

    expect(await stored(company._id)).toMatchObject({
      verification: "unverified",
      verificationLockedReason: "domain_changed",
    });
  });

  it("locks a rename made while an email change has the badge down", async () => {
    const { session, password, company } = await employerSession(app, { email: OWNER_EMAIL });

    const moved = await changeEmailAndConfirm(session, password, "boss@other-demo.example");
    expect((await stored(company._id))?.verification).toBe("unverified");
    await moved.patch("/api/employer/company").send({ name: "Google LLC" }).expect(200);
    await changeEmailAndConfirm(moved, password, SAME_DOMAIN_EMAIL);

    expect(await stored(company._id)).toMatchObject({
      verification: "unverified",
      verificationLockedReason: "renamed",
    });
  });

  it("stays unverified when an admin lifts a suspension", async () => {
    const { session, company } = await employerSession(app, { email: OWNER_EMAIL });
    await session.patch("/api/employer/company").send({ name: "Google LLC" }).expect(200);

    expect(await runAdmin(["suspend-company", company.slug], quiet)).toBe(0);
    expect(await runAdmin(["unsuspend-company", company.slug], quiet)).toBe(0);

    expect(await stored(company._id)).toMatchObject({
      verification: "unverified",
      verificationLockedReason: "renamed",
    });
  });

  it("gets the badge back only from an admin approval, which clears the lock and records the domain", async () => {
    const { session, company } = await employerSession(app, { email: OWNER_EMAIL });
    await session.patch("/api/employer/company").send({ name: "Acme Demo Group" }).expect(200);

    expect(await runAdmin(["approve-company", company.slug], quiet)).toBe(0);

    const approved = await stored(company._id);
    expect(approved).toMatchObject({
      verification: "verified",
      verifiedDomain: "acme-demo.example",
    });
    expect(approved?.verificationLockedReason).toBeUndefined();
  });

  it("does not lock a company that never had the badge", async () => {
    const { session, password, company } = await employerSession(app, {
      email: "boss@other-demo.example",
      companyVerified: false,
    });
    await session.patch("/api/employer/company").send({ name: "Acme Demo Group" }).expect(200);

    await changeEmailAndConfirm(session, password, SAME_DOMAIN_EMAIL);

    const verified = await stored(company._id);
    expect(verified).toMatchObject({
      verification: "verified",
      verifiedDomain: "acme-demo.example",
    });
    expect(verified?.verificationLockedReason).toBeUndefined();
  });
});

describe("the verified domain", () => {
  it("is recorded when the owner's confirmed email verifies the company", async () => {
    const { session, password, company } = await employerSession(app, {
      email: "boss@other-demo.example",
      companyVerified: false,
    });

    await changeEmailAndConfirm(session, password, SAME_DOMAIN_EMAIL);

    expect(await stored(company._id)).toMatchObject({
      verification: "verified",
      verifiedDomain: "acme-demo.example",
    });
  });

  it("comes with a verified company on the job board and the job page, and is null otherwise", async () => {
    const verified = await createEmployer({ email: OWNER_EMAIL });
    const unverified = await createEmployer({ companyVerified: false });
    const verifiedJob = await createJob(verified.company._id, { title: "Verified role" });
    await createJob(unverified.company._id, { title: "Unverified role" });

    const list = await request(app).get("/api/jobs").expect(200);
    const items = (list.body as { items: PublicJobSummary[] }).items;
    const companyFor = (title: string) => items.find((item) => item.title === title)?.company;
    expect(companyFor("Verified role")).toMatchObject({ verifiedDomain: "acme-demo.example" });
    expect(companyFor("Unverified role")).toMatchObject({ verifiedDomain: null });

    const detail = await request(app).get(`/api/jobs/${verifiedJob.slug}`).expect(200);
    const body = detail.body as { job: PublicJob; company: PublicCompany };
    expect(body.job.company.verifiedDomain).toBe("acme-demo.example");
    expect(body.company.verifiedDomain).toBe("acme-demo.example");
  });
});

describe("company names in student emails", () => {
  it("are stored and sent on one line, with no link in them", async () => {
    const { session, company } = await employerSession(app);
    const res = await session
      .patch("/api/employer/company")
      .send({ name: "Acme\n\nACTION NEEDED: confirm at https://evil.example" })
      .expect(200);
    const name = "Acme ACTION NEEDED: confirm at https://evil.example";
    expect(companyOf(res).name).toBe(name);
    expect((await stored(company._id))?.name).toBe(name);

    const job = await createJob(company._id, { title: "Field rep" });
    const student = await createStudent();
    await createApplication({ jobId: job._id, studentId: student.user._id });
    await session
      .post(`/api/employer/jobs/${job.id}/status`)
      .send({ status: "archived" })
      .expect(200);

    const [message] = mailer.sent;
    expect(message?.to).toBe(student.email);
    const html = message?.html ?? "";
    for (const body of [message?.text ?? "", html.slice(html.indexOf("<body"))]) {
      expect(body).not.toMatch(/\n\s*ACTION NEEDED/);
      expect(body).not.toMatch(/https?:\/\/evil/);
      expect(body).not.toMatch(/evil\.example/);
    }
    expect(message?.text.replaceAll("​", "")).toContain(`${name} closed applications`);
  });
});
