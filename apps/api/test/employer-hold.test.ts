import { afterEach, describe, expect, it } from "vitest";
import { Company, EmployerHold, User } from "../src/db/models/index.js";
import { runAdmin, type AdminIo } from "../src/scripts/run-admin.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent, withCsrf } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { TEST_PASSWORD } from "./helpers/factories.js";
import { employerSession } from "./helpers/sessions.js";

useTestDb();

const { app, mailer } = makeTestApp();

afterEach(() => {
  mailer.sent.length = 0;
});

const OWNER_EMAIL = "boss@acme-demo.example";
const WEBSITE = "https://www.acme-demo.example";

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  const io: AdminIo = { out: (line) => out.push(line), err: (line) => err.push(line) };
  return { io, out, err };
}

const admin = async (...argv: string[]) => {
  const { io, out, err } = captureIo();
  const code = await runAdmin(argv, io);
  return { code, out, err };
};

const employerSignup = (email: string, website = WEBSITE) => ({
  role: "employer",
  firstName: "Jane",
  lastName: "Example",
  email,
  password: TEST_PASSWORD,
  jobTitle: "Head of talent",
  company: { name: "Fresh Start Co", website },
});

const signup = async (body: object) => (await csrfAgent(app)).post("/api/auth/signup").send(body);

/** A verified employer whose company an admin suspends, who then deletes the account. */
async function suspendThenDelete() {
  const { session, password, company } = await employerSession(app, { email: OWNER_EMAIL });
  expect((await admin("suspend-company", company.slug)).code).toBe(0);
  await session.delete("/api/me").send({ currentPassword: password }).expect(204);
  expect(await User.exists({ email: OWNER_EMAIL })).toBeNull();
  return company;
}

/** Signs a new employer up and follows the verification link sent to them. */
async function signUpAndConfirm(email: string) {
  expect((await signup(employerSignup(email))).status).toBe(201);
  const token = /token=([\w-]+)/.exec(
    mailer.sent.findLast((message) => message.to === email)?.text ?? "",
  )?.[1];
  await (await csrfAgent(app)).post("/api/auth/verify-email").send({ token }).expect(200);
  const user = await User.findOne({ email }).lean();
  return Company.findOne({ ownerId: user?._id }).lean();
}

describe("a suspended employer's hold", () => {
  it("keeps the owner's email from opening a new employer account after the old one is deleted", async () => {
    await suspendThenDelete();
    mailer.sent.length = 0;

    const res = await signup(employerSignup(OWNER_EMAIL));

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(await User.exists({ email: OWNER_EMAIL })).toBeNull();
    expect(mailer.sent.map((message) => message.to)).toEqual([OWNER_EMAIL]);
    expect(mailer.sent[0]?.text).not.toContain("token=");
  });

  it("keeps a new company on the suspended company's domain from being verified", async () => {
    await suspendThenDelete();

    const company = await signUpAndConfirm("hiring@acme-demo.example");

    expect(company?.verification).toBe("unverified");
  });

  it("holds the domain while the suspended company still exists", async () => {
    const { company } = await employerSession(app, { email: OWNER_EMAIL });
    await admin("suspend-company", company.slug);

    expect((await signUpAndConfirm("hiring@acme-demo.example"))?.verification).toBe("unverified");
  });

  it("stores no email and no account, only a keyed hash and the domain", async () => {
    const { _id } = await suspendThenDelete();

    const holds = await EmployerHold.find().lean();

    expect(holds).toHaveLength(1);
    const [hold] = holds;
    expect(hold?.domain).toBe("acme-demo.example");
    expect(hold?.companyId).toBeUndefined();
    expect(hold?.emailKeys).toHaveLength(1);
    expect(hold?.emailKeys[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(hold)).not.toContain("boss");
    expect(JSON.stringify(hold)).not.toContain(_id.toString());
  });

  it("is listed by the admin CLI and lifted by id, after which both work again", async () => {
    await suspendThenDelete();

    const listed = await admin("list-holds");
    expect(listed.code).toBe(0);
    const line = listed.out.find((text) => text.includes("acme-demo.example"));
    expect(line).toMatch(/account deleted/);
    const id = line?.split(/\s+/)[0] ?? "";

    expect((await admin("lift-hold", id)).code).toBe(0);
    expect(await EmployerHold.countDocuments()).toBe(0);
    expect((await admin("list-holds")).out).toEqual(["No employer holds"]);
    expect((await signUpAndConfirm(OWNER_EMAIL))?.verification).toBe("verified");
  });

  it("is lifted by domain too, and an unknown hold is an error", async () => {
    await suspendThenDelete();

    expect((await admin("lift-hold", "nothing-here.example")).code).toBe(1);
    expect((await admin("lift-hold", "acme-demo.example")).code).toBe(0);
    expect(await EmployerHold.countDocuments()).toBe(0);
  });

  it("goes when an admin lifts the suspension of a company that still exists", async () => {
    const { company } = await employerSession(app, { email: OWNER_EMAIL });
    await admin("suspend-company", company.slug);
    expect(await EmployerHold.countDocuments()).toBe(1);

    await admin("unsuspend-company", company.slug);

    expect(await EmployerHold.countDocuments()).toBe(0);
    expect((await signUpAndConfirm("hiring@acme-demo.example"))?.verification).toBe("verified");
  });

  it("makes approve-company refuse a company on a held domain", async () => {
    await suspendThenDelete();
    expect((await signup(employerSignup("someone@elsewhere-demo.example"))).status).toBe(201);
    const user = await User.findOne({ email: "someone@elsewhere-demo.example" }).lean();
    const company = await Company.findOne({ ownerId: user?._id }).lean();

    const res = await admin("approve-company", company?.slug ?? "");

    expect(res.code).toBe(1);
    expect(res.err.join("\n")).toMatch(/held/);
    expect((await Company.findById(company?._id).lean())?.verification).toBe("unverified");
  });

  it("keeps the old email held when a suspended owner moves to another one first", async () => {
    const { session, password, company } = await employerSession(app, { email: OWNER_EMAIL });
    await admin("suspend-company", company.slug);
    const moved = "boss.new@elsewhere-demo.example";
    await session.post("/api/me/change-email").send({ currentPassword: password, newEmail: moved });
    const token = /token=([\w-]+)/.exec(
      mailer.sent.findLast((message) => message.to === moved)?.text ?? "",
    )?.[1];
    await (await csrfAgent(app)).post("/api/auth/verify-email").send({ token }).expect(200);
    const current = await withCsrf(session.agent);
    await current.delete("/api/me").send({ currentPassword: password }).expect(204);

    for (const email of [OWNER_EMAIL, moved]) {
      expect((await signup(employerSignup(email))).status).toBe(201);
      expect(await User.exists({ email })).toBeNull();
    }
    expect((await EmployerHold.findOne().lean())?.emailKeys).toHaveLength(2);
  });

  it("is added by migrate for a company suspended before holds were kept", async () => {
    const { company } = await employerSession(app, { email: OWNER_EMAIL });
    await Company.updateOne({ _id: company._id }, { verification: "suspended" });

    const first = await admin("migrate");
    const again = await admin("migrate");

    expect(first.out).toContain("Hold added for 1 suspended company");
    expect(again.out).toContain("Hold added for 0 suspended companies");
    expect(await EmployerHold.findOne({ companyId: company._id }).lean()).toMatchObject({
      domain: "acme-demo.example",
    });
  });

  it("still lets the held email sign up as a student", async () => {
    await suspendThenDelete();

    const res = await signup({
      role: "student",
      firstName: "Jane",
      lastName: "Example",
      email: OWNER_EMAIL,
      password: TEST_PASSWORD,
      school: "Example State University",
      major: "Marketing",
      gradYear: new Date().getUTCFullYear() + 1,
      targetRole: "Sales development rep",
      industry: "Software",
      state: "MA",
      ageConfirmed: true,
    });

    expect(res.status).toBe(201);
    expect(await User.exists({ email: OWNER_EMAIL })).not.toBeNull();
  });
});
