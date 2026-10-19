export type ErrorFields = Record<string, string>;

export type ForbiddenCode = "forbidden" | "csrf_failed" | "email_not_verified" | "consent_required";
export type ConflictCode = "conflict" | "email_taken" | "already_applied";

/** An error that is safe to show to clients: it maps directly to a status and a stable code. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly fields?: ErrorFields,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(fields?: ErrorFields, message = "Some fields need attention") {
    super("validation_failed", 400, message, fields);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Sign in to continue") {
    super("unauthenticated", 401, message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super("invalid_credentials", 401, "Email or password is incorrect");
  }
}

export class ForbiddenError extends AppError {
  constructor(code: ForbiddenCode = "forbidden", message = "You can't do that") {
    super(code, 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super("not_found", 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(code: ConflictCode = "conflict", message = "That conflicts with existing data") {
    super(code, 409, message);
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = "That upload is too large") {
    super("file_too_large", 413, message);
  }
}

export class UnsupportedFileError extends AppError {
  constructor(message = "That file type isn't supported") {
    super("unsupported_file", 415, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfterSec: number, message = "Too many requests. Try again soon") {
    super("rate_limited", 429, message, undefined, retryAfterSec);
  }
}

export class QuotaExceededError extends AppError {
  constructor(retryAfterSec: number, message = "You've used your practice sessions for now") {
    super("quota_exceeded", 429, message, undefined, retryAfterSec);
  }
}

export class BudgetExhaustedError extends AppError {
  constructor(retryAfterSec: number, message = "Practice is at capacity. Try again later") {
    super("budget_exhausted", 429, message, undefined, retryAfterSec);
  }
}

export class UpstreamError extends AppError {
  constructor(message = "A service we depend on isn't responding") {
    super("upstream_error", 502, message);
  }
}

export class PracticeUnavailableError extends AppError {
  constructor(message = "Practice isn't available right now") {
    super("practice_unavailable", 503, message);
  }
}
