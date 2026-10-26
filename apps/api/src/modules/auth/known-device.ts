import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { LIMITS } from "@pitchperfect/shared";
import type { Config } from "../../config.js";

/**
 * Marks a browser that has signed in to an account, or reset its password, before. Failed
 * sign-ins from other browsers can't slow that browser down (see `authRoutes`).
 */
export const DEVICE_COOKIE = "pp.device";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AGE_MS = LIMITS.signinDeviceDays * DAY_MS;
/** Allowance for clocks of several api instances that disagree slightly. */
const CLOCK_SKEW_MS = 60 * 1000;
const TOKEN_PATTERN = /^(\d{1,15})\.([A-Za-z0-9_-]{43})$/;

type DeviceConfig = Pick<Config, "SESSION_SECRET" | "isProd">;

const macOf = (secret: string, email: string, issuedAt: number) =>
  createHmac("sha256", secret)
    .update(`signin-device:${email.trim().toLowerCase()}:${String(issuedAt)}`)
    .digest("base64url");

/**
 * `<issued at, epoch ms>.<HMAC>`, keyed with `SESSION_SECRET`. The email is only inside the HMAC,
 * so the cookie doesn't say whose account it is.
 */
export function deviceToken(secret: string, email: string, issuedAt: Date): string {
  const at = issuedAt.getTime();
  return `${String(at)}.${macOf(secret, email, at)}`;
}

/** True when `token` was issued by this server for `email` within `LIMITS.signinDeviceDays`. */
export function isKnownDevice(secret: string, email: string, token: unknown, now: Date): boolean {
  const match = typeof token === "string" ? TOKEN_PATTERN.exec(token) : null;
  if (!match?.[1] || !match[2]) return false;
  const issuedAt = Number(match[1]);
  const age = now.getTime() - issuedAt;
  if (age < -CLOCK_SKEW_MS || age > MAX_AGE_MS) return false;
  const expected = Buffer.from(macOf(secret, email, issuedAt));
  const given = Buffer.from(match[2]);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Sets `pp.device` for `email`: httpOnly, `Secure` in production, `SameSite=Lax`, sent only to
 * `/api/auth`, for `LIMITS.signinDeviceDays`. A later sign-in with another email replaces it.
 */
export function rememberDevice(config: DeviceConfig, res: Response, email: string): void {
  res.cookie(DEVICE_COOKIE, deviceToken(config.SESSION_SECRET, email, new Date()), {
    httpOnly: true,
    secure: config.isProd,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: MAX_AGE_MS,
  });
}

/** True when the request carries a valid `pp.device` cookie for `email`. */
export function fromKnownDevice(config: DeviceConfig, req: Request, email: string): boolean {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  return isKnownDevice(config.SESSION_SECRET, email, cookies?.[DEVICE_COOKIE], new Date());
}
