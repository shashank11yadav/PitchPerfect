import request from "supertest";
import { describe, expect, it } from "vitest";
import type { PublicCompany } from "@pitchperfect/shared";
import { Company } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { employerSession, studentSession } from "./helpers/sessions.js";

useTestDb();

const { app } = makeTestApp();

const companyOf = (res: { body: unknown }) => (res.body as { company: PublicCompany }).company;
const MATCHING_EMAIL = "boss@acme-demo.example";

describe("GET /api/employer/company", () => {
  it("returns the signed-in employer's company without private fields", async () => {
    const { session, company } = await employerSession(app);

    const res = await session.agent.get("/api/employer/company");

    expect(res.status).toBe(200);
    expect(companyOf(res)).toMatchObject({
      id: company.id,
      name: "Acme Demo Co",
      verification: "verified",
    });
    expect(JSON.stringify(res.body)).not.toContain("ownerId");
  });

  it("requires an employer", async () => {
    const student = await studentSession(app);
    expect((await student.session.agent.get("/api/employer/company")).status).toBe(403);
    expect((await request(app).get("/api/employer/company")).status).toBe(401);
  });

  it("lets an unverified-email employer read but not write", async () => {
    const { session } = await employerSession(app, { verified: false });

    expect((await session.agent.get("/api/employer/company")).status).toBe(200);
    const res = await session.patch("/api/employer/company").send({ pitch: "Hello" });

    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe("email_not_verified");
  });
});

describe("PATCH /api/employer/company", () => {
  it("updates name, pitch, linkedin and logo and leaves the slug alone", async () => {
    const { session, company } = await employerSession(app);

    const res = await session.patch("/api/employer/company").send({
      name: "Acme Renamed",
      pitch: "We sell demo widgets.",
      linkedinUrl: "https://www.linkedin.example/company/acme",
      logoUrl: "https://cdn.acme-demo.example/logo.png",
    });

    expect(res.status).toBe(200);
    expect(companyOf(res)).toMatchObject({
      name: "Acme Renamed",
      pitch: "We sell demo widgets.",
      logoUrl: "https://cdn.acme-demo.example/logo.png",
      slug: company.slug,
      verification: "verified",
    });
    expect((await Company.findById(company._id))?.name).toBe("Acme Renamed");
  });

  it("clears optional urls with null", async () => {
    const { session } = await employerSession(app);
    await session.patch("/api/employer/company").send({ logoUrl: "https://a.example/l.png" });

    const res = await session.patch("/api/employer/company").send({ logoUrl: null });

    expect(companyOf(res).logoUrl).toBeNull();
  });

  it("rejects non-https urls, unknown fields, and fields that are not writable", async () => {
    const { session } = await employerSession(app);

    const http = await session
      .patch("/api/employer/company")
      .send({ logoUrl: "http://x.example/l.png" });
    expect(http.status).toBe(400);
    expect(errorOf(http).fields).toHaveProperty("logoUrl");
    for (const body of [
      { verification: "verified" },
      { ownerId: "507f1f77bcf86cd799439011" },
      { slug: "mine" },
    ]) {
      expect((await session.patch("/api/employer/company").send(body)).status).toBe(400);
    }
  });

  it("treats an empty body as a no-op", async () => {
    const { session } = await employerSession(app);
    const res = await session.patch("/api/employer/company").send({});
    expect(res.status).toBe(200);
    expect(companyOf(res).name).toBe("Acme Demo Co");
  });

  it("demotes a verified company when the website no longer matches the owner's email domain", async () => {
    const { session, company } = await employerSession(app, { email: MATCHING_EMAIL });

    const res = await session
      .patch("/api/employer/company")
      .send({ website: "https://elsewhere-demo.example" });

    expect(companyOf(res)).toMatchObject({
      website: "https://elsewhere-demo.example",
      verification: "unverified",
    });
    expect((await Company.findById(company._id))?.verification).toBe("unverified");
  });

  it("promotes an unverified company when the website now matches the owner's email domain", async () => {
    const { session } = await employerSession(app, {
      email: MATCHING_EMAIL,
      companyVerified: false,
      website: "https://elsewhere-demo.example",
    });

    const res = await session
      .patch("/api/employer/company")
      .send({ website: "https://www.acme-demo.example" });

    expect(companyOf(res).verification).toBe("verified");
  });

  it("never touches a suspended company", async () => {
    const { session, company } = await employerSession(app, { email: MATCHING_EMAIL });
    await Company.updateOne({ _id: company._id }, { $set: { verification: "suspended" } });

    const res = await session
      .patch("/api/employer/company")
      .send({ website: "https://www.acme-demo.example/about" });
    const other = await session
      .patch("/api/employer/company")
      .send({ website: "https://other-demo.example" });

    expect(companyOf(res).verification).toBe("suspended");
    expect(companyOf(other).verification).toBe("suspended");
  });

  it("never verifies on a free-mail address", async () => {
    const { session } = await employerSession(app, {
      email: "owner@gmail.com",
      companyVerified: false,
    });

    const res = await session.patch("/api/employer/company").send({ website: "https://gmail.com" });

    expect(companyOf(res).verification).toBe("unverified");
  });

  it("does not re-check verification when the website is unchanged", async () => {
    const { session } = await employerSession(app, { email: "someone@unrelated-demo.example" });

    const res = await session.patch("/api/employer/company").send({ pitch: "New pitch" });

    expect(companyOf(res).verification).toBe("verified");
  });
});

describe("employer write rate limit", () => {
  it("allows 60 writes a minute per user, then answers 429", async () => {
    const { session } = await employerSession(app);
    for (let i = 0; i < 60; i++) {
      expect((await session.patch("/api/employer/company").send({})).status).toBe(200);
    }

    const res = await session.patch("/api/employer/company").send({});

    expect(res.status).toBe(429);
    expect(errorOf(res).code).toBe("rate_limited");
    expect((await session.agent.get("/api/employer/company")).status).toBe(200);
  });
});
