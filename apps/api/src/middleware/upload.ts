import type { RequestHandler } from "express";
import multer from "multer";
import { LIMITS } from "@pitchperfect/shared";
import { PayloadTooLargeError, ValidationError } from "../errors.js";

const FIELD = "file";
const MIB = 1024 * 1024;

/**
 * One `file` part held in memory, nothing else: no text fields, no second file. The size cap is
 * enforced while the stream is read, so an oversized upload is cut off rather than buffered.
 */
const single = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITS.resumeMaxBytes, files: 1, fields: 0, parts: 1 },
}).single(FIELD);

/**
 * Parses a résumé upload into `req.file`. Too large is a 413; anything else wrong with the form
 * (extra parts, wrong field name, a body that isn't valid multipart) is a 400.
 * Mount it after the auth guards so anonymous callers never make the server buffer a body.
 */
export const uploadResume: RequestHandler = (req, res, next) => {
  single(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      next(
        new PayloadTooLargeError(`Résumés can be up to ${String(LIMITS.resumeMaxBytes / MIB)} MB`),
      );
    } else if (error) {
      next(new ValidationError({ [FIELD]: "Send one PDF in the file field" }));
    } else {
      next();
    }
  });
};
