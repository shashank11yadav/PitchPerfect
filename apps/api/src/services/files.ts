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

const randomFileName = () => `${randomBytes(FILE_NAME_BYTES).toString("hex")}.pdf`;

/** Stores the PDF in GridFS under a random name (never the uploaded one) and returns its id. */
export async function saveResume(ownerId: Types.ObjectId, buffer: Buffer): Promise<Types.ObjectId> {
  const upload = bucket().openUploadStream(randomFileName(), { metadata: { ownerId } });
  await pipeline(Readable.from([buffer]), upload);
  return upload.id;
}

/**
 * Copies a stored résumé to a new file of the same owner, so the copy stays as it is when the
 * original is replaced. Null when the original is already gone; a copy that fails part-way is
 * removed.
 */
export async function copyResume(
  fileId: Types.ObjectId,
  ownerId: Types.ObjectId,
): Promise<Types.ObjectId | null> {
  const files = bucket();
  if (!(await files.find({ _id: fileId }).hasNext())) return null;
  const upload = files.openUploadStream(randomFileName(), { metadata: { ownerId } });
  try {
    await pipeline(files.openDownloadStream(fileId), upload);
  } catch (error) {
    // Removes whatever chunks were written; it reports "not found" when no file document was.
    await files.delete(upload.id).catch(() => undefined);
    throw error;
  }
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

/** Removes the file and its chunks. A file that is already gone is fine; any other failure is not. */
export async function deleteResume(fileId: Types.ObjectId): Promise<void> {
  const files = bucket();
  if (!(await files.find({ _id: fileId }).hasNext())) return;
  await files.delete(fileId);
}
