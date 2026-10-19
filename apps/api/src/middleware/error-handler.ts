import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { AppError, ConflictError, PayloadTooLargeError, ValidationError } from "../errors.js";
import { requestIdOf } from "./request-id.js";
import { fieldErrors } from "./validate.js";

const DUPLICATE_KEY_CODE = 11000;

function hasProperty<K extends string>(value: unknown, key: K): value is Record<K, unknown> {
  return typeof value === "object" && value !== null && key in value;
}

/** Body-parser failures carry a string `type` (e.g. `entity.too.large`) and a 4xx `status`. */
function isBodyParserError(error: unknown): error is { type: string; status: number } {
  return (
    hasProperty(error, "type") &&
    typeof error.type === "string" &&
    hasProperty(error, "status") &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  );
}

/** Maps anything thrown to an error that is safe to send. Unknown errors never expose their message. */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) return new ValidationError(fieldErrors(error.issues));
  if (error instanceof mongoose.Error.CastError) {
    return new AppError("invalid_id", 400, "That identifier isn't valid");
  }
  if (hasProperty(error, "code") && error.code === DUPLICATE_KEY_CODE) return new ConflictError();
  if (isBodyParserError(error)) {
    return error.status === 413
      ? new PayloadTooLargeError("The request body is too large")
      : new ValidationError(undefined, "The request body couldn't be read");
  }
  return new AppError("internal_error", 500, "Something went wrong");
}

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const appError = toAppError(error);
  if (appError.status >= 500) req.log.error({ err: error }, "request failed");
  if (appError.retryAfterSec !== undefined) {
    res.setHeader("Retry-After", String(appError.retryAfterSec));
  }
  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      requestId: requestIdOf(res),
      ...(appError.fields && { fields: appError.fields }),
    },
  });
};
