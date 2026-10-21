import mongoose from "mongoose";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { LIMITS } from "@pitchperfect/shared";
import { StudentProfile } from "../src/db/models/index.js";
import { makeTestApp } from "./helpers/app.js";
import { csrfAgent, TEST_ORIGIN, type CsrfAgent } from "./helpers/csrf.js";
import { useTestDb } from "./helpers/db.js";
import { errorOf } from "./helpers/error-body.js";
import { createEmployer, createStudent, signIn } from "./helpers/factories.js";
import { fakePdf, pdfOfSize, tinyPdf } from "./helpers/pdf.js";

useTestDb();

const { app } = makeTestApp();

const files = () => mongoose.connection.collection("resumes.files");
const chunks = () => mongoose.connection.collection("resumes.chunks");

const upload = (session: CsrfAgent, content: Buffer, filename = "my-cv.pdf") =>
  session
    .put("/api/me/resume")
    .attach("file", content, { filename, contentType: "application/pdf" });

async function studentSession() {
  const { email, password, user } = await createStudent();
  return { session: await signIn(request.agent(app), email, password), user };
}

const binary = (res: request.Response, done: (error: Error | null, body: Buffer) => void): void => {
  const parts: Buffer[] = [];
  res.on("data", (part: Buffer) => parts.push(part));
  res.on("end", () => {
    done(null, Buffer.concat(parts));
  });
};

describe("PUT /api/me/resume", () => {
  it("stores a PDF under a random name and reports its size", async () => {
    const { session, user } = await studentSession();
    const pdf = tinyPdf();

    const res = await upload(session, pdf, "My Private CV.pdf");

    const body = res.body as { resume: { uploadedAt: string; sizeBytes: number } };
    expect(res.status).toBe(200);
    expect(body.resume.sizeBytes).toBe(pdf.length);
    expect(new Date(body.resume.uploadedAt).getTime()).not.toBeNaN();
    const stored = await files().find().toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.filename).not.toContain("CV");
    expect(stored[0]?.filename).toMatch(/^[0-9a-f]{32}\.pdf$/);
    expect((stored[0]?.metadata as { ownerId: mongoose.Types.ObjectId }).ownerId.toString()).toBe(
      user.id,
    );
    const profile = await StudentProfile.findOne({ userId: user._id });
    expect(profile?.resumeFileId?.toString()).toBe(String(stored[0]?._id));
    expect(JSON.stringify(res.body)).not.toContain(String(stored[0]?._id));
  });

  it("replaces the previous résumé and deletes the old file", async () => {
    const { session } = await studentSession();
    await upload(session, tinyPdf()).expect(200);
    const [first] = await files().find().toArray();

    await upload(session, pdfOfSize(1000)).expect(200);

    const stored = await files().find().toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]?._id.toString()).not.toBe(first?._id.toString());
    expect(stored[0]?.length).toBe(1000);
    expect(await chunks().countDocuments({ files_id: first?._id })).toBe(0);
  });

  it("rejects a file that only claims to be a PDF", async () => {
    const { session, user } = await studentSession();

    const res = await upload(session, fakePdf(), "resume.pdf");

    expect(res.status).toBe(415);
    expect(errorOf(res).code).toBe("unsupported_file");
    expect(await files().countDocuments()).toBe(0);
    expect((await StudentProfile.findOne({ userId: user._id }))?.resumeFileId).toBeUndefined();
  });

  it("rejects an empty file", async () => {
    const { session } = await studentSession();
    expect((await upload(session, Buffer.alloc(0))).status).toBe(415);
  });

  it("accepts exactly 2 MB and rejects one byte more", async () => {
    const { session } = await studentSession();

    await upload(session, pdfOfSize(LIMITS.resumeMaxBytes)).expect(200);
    const tooBig = await upload(session, pdfOfSize(LIMITS.resumeMaxBytes + 1));

    expect(tooBig.status).toBe(413);
    expect(errorOf(tooBig).code).toBe("file_too_large");
    expect((await files().find().toArray()).map((file) => file.length as number)).toEqual([
      LIMITS.resumeMaxBytes,
    ]);
  });

  it("needs exactly one file in the `file` field and nothing else", async () => {
    const { session } = await studentSession();
    const pdf = tinyPdf();

    expect((await session.put("/api/me/resume").send({})).status).toBe(400);
    expect((await session.put("/api/me/resume").field("note", "hi")).status).toBe(400);
    expect((await session.put("/api/me/resume").attach("cv", pdf, "a.pdf")).status).toBe(400);
    expect(
      (
        await session
          .put("/api/me/resume")
          .attach("file", pdf, "a.pdf")
          .attach("file", pdf, "b.pdf")
      ).status,
    ).toBe(400);
    expect(await files().countDocuments()).toBe(0);
  });

  it("is for signed-in students and needs CSRF and Origin", async () => {
    const anonymous = await csrfAgent(app);
    expect((await upload(anonymous, tinyPdf())).status).toBe(401);

    const { email, password } = await createEmployer();
    const employer = await signIn(request.agent(app), email, password);
    expect((await upload(employer, tinyPdf())).status).toBe(403);

    const { session } = await studentSession();
    const noToken = await session.agent
      .put("/api/me/resume")
      .set("Origin", TEST_ORIGIN)
      .attach("file", tinyPdf(), "a.pdf");
    const wrongOrigin = await session.agent
      .put("/api/me/resume")
      .set("Origin", "https://evil.example")
      .set("x-csrf-token", session.token)
      .attach("file", tinyPdf(), "a.pdf");
    expect(noToken.status).toBe(403);
    expect(wrongOrigin.status).toBe(403);
    expect(await files().countDocuments()).toBe(0);
  });
});

describe("PUT /api/me/resume rate limit", () => {
  it("answers 429 after 20 uploads an hour by one student", async () => {
    const { session } = await studentSession();
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) statuses.push((await upload(session, tinyPdf())).status);

    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
    expect(await files().countDocuments()).toBe(1);
  });
});

describe("GET /api/me/resume", () => {
  it("streams the PDF as an attachment with safe headers", async () => {
    const { session } = await studentSession();
    const pdf = tinyPdf();
    await upload(session, pdf, "evil<script>.pdf").expect(200);

    const res = await session.agent.get("/api/me/resume").buffer(true).parse(binary);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("application/pdf");
    expect(res.headers["content-disposition"]).toBe('attachment; filename="resume.pdf"');
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["content-length"]).toBe(String(pdf.length));
    expect((res.body as Buffer).equals(pdf)).toBe(true);
  });

  it("answers 404 without a résumé and never serves another student's", async () => {
    const { session } = await studentSession();
    const other = await studentSession();
    await upload(other.session, tinyPdf()).expect(200);

    const res = await session.agent.get("/api/me/resume");

    expect(res.status).toBe(404);
    expect(errorOf(res).code).toBe("not_found");
  });

  it("is for signed-in students", async () => {
    expect((await request(app).get("/api/me/resume")).status).toBe(401);
    const { email, password } = await createEmployer();
    const employer = await signIn(request.agent(app), email, password);
    expect((await employer.agent.get("/api/me/resume")).status).toBe(403);
  });
});

describe("DELETE /api/me/resume", () => {
  it("removes the file and the reference, and is idempotent", async () => {
    const { session, user } = await studentSession();
    await upload(session, tinyPdf()).expect(200);

    await session.delete("/api/me/resume").expect(204);
    await session.delete("/api/me/resume").expect(204);

    expect(await files().countDocuments()).toBe(0);
    expect(await chunks().countDocuments()).toBe(0);
    expect((await StudentProfile.findOne({ userId: user._id }))?.resumeFileId).toBeUndefined();
    await session.agent.get("/api/me/resume").expect(404);
  });

  it("is for signed-in students", async () => {
    expect((await (await csrfAgent(app)).delete("/api/me/resume")).status).toBe(401);
    const { email, password } = await createEmployer();
    const employer = await signIn(request.agent(app), email, password);
    expect((await employer.delete("/api/me/resume")).status).toBe(403);
  });
});
