import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";
import { fileTypeFromBuffer } from "file-type";
import mongoose, { type Types } from "mongoose";
import { NotFoundError, UnsupportedFileError } from "../errors.js";

const BUCKET = "resumes";
const PDF_MIME = "application/pdf";
const FILE_NAME_BYTES = 16;

function bucket(): mongoose.mongo.GridFSBucket {
  const { db } = mongoose.connection;
  if (!db) throw new Error("database is not connected");
  return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET });
}

/** 415 unless the bytes really start like a PDF. The uploaded name and declared type are ignored. */
export async function assertPdf(buffer: Buffer): Promise<void> {
  const detected = await fileTypeFromBuffer(buffer);
  if (detected?.mime !== PDF_MIME) throw new UnsupportedFileError("Upload a PDF file");
}

/** Stores the PDF in GridFS under a random name (never the uploaded one) and returns its id. */
export async function saveResume(ownerId: Types.ObjectId, buffer: Buffer): Promise<Types.ObjectId> {
  const upload = bucket().openUploadStream(`${randomBytes(FILE_NAME_BYTES).toString("hex")}.pdf`, {
    metadata: { ownerId },
  });
  await pipeline(Readable.from([buffer]), upload);
  return upload.id;
}

/**
 * Streams the PDF as a download. It is always an attachment with `nosniff`, so a browser never
 * renders it in our origin. Throws `NotFoundError` before sending anything if the file is gone.
 */
export async function streamResume(fileId: Types.ObjectId, res: Response): Promise<void> {
  const file = await bucket().find({ _id: fileId }).next();
  if (!file) throw new NotFoundError("Résumé not found");
  res.set({
    "Content-Type": PDF_MIME,
    "Content-Length": String(file.length),
    "Content-Disposition": 'attachment; filename="resume.pdf"',
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
  });
  await pipeline(bucket().openDownloadStream(fileId), res);
}

/**
 * Removes the file and its chunks. A file that is already gone is fine: the driver reports that
 * as a `MongoRuntimeError` after it has cleaned up any orphaned chunks.
 */
export async function deleteResume(fileId: Types.ObjectId): Promise<void> {
  try {
    await bucket().delete(fileId);
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoRuntimeError)) throw error;
  }
}
