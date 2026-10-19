import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteResume, saveResume } from "../src/services/files.js";
import { useTestDb } from "./helpers/db.js";
import { tinyPdf } from "./helpers/pdf.js";

useTestDb();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("deleteResume", () => {
  it("removes the file and its chunks", async () => {
    const id = await saveResume(new mongoose.Types.ObjectId(), tinyPdf());

    await deleteResume(id);

    expect(await mongoose.connection.collection("resumes.files").countDocuments()).toBe(0);
    expect(await mongoose.connection.collection("resumes.chunks").countDocuments()).toBe(0);
  });

  it("tolerates a file that is already gone", async () => {
    await expect(deleteResume(new mongoose.Types.ObjectId())).resolves.toBeUndefined();
  });

  it("lets any other failure through", async () => {
    const id = await saveResume(new mongoose.Types.ObjectId(), tinyPdf());
    vi.spyOn(mongoose.mongo.GridFSBucket.prototype, "delete").mockRejectedValueOnce(
      new mongoose.mongo.MongoRuntimeError("something else broke"),
    );

    await expect(deleteResume(id)).rejects.toThrow("something else broke");
  });
});
