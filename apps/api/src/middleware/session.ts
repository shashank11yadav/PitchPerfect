import MongoStore from "connect-mongo";
import express, { type CookieOptions, type RequestHandler, type Response } from "express";
import session from "express-session";
import type { Connection } from "mongoose";
import { LIMITS, type Role } from "@pitchperfect/shared";
import type { Config } from "../config.js";

declare module "express-session" {
  interface SessionData {
    userId: string;
    role: Role;
    /** The user's `sessionVersion` at sign-in; a mismatch means the session was revoked. */
    sessionVersion: number;
    /** Epoch milliseconds of sign-in; the 30-day absolute limit counts from here. */
    createdAt: number;
  }
}

export interface SessionIdentity {
  userId: string;
  role: Role;
  sessionVersion: number;
}

const SESSION_COOKIE = "pp.sid";
const SESSIONS_COLLECTION = "sessions";

/** The client of the app's existing Mongoose connection, so sessions share its pool. */
type ConnectionClient = ReturnType<Connection["getClient"]>;
/** connect-mongo is typed against its own copy of the driver; the runtime API is the same. */
type StoreClient = NonNullable<Parameters<typeof MongoStore.create>[0]["client"]>;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Opens the Mongo-backed store on first use, so the app can be built before the database is
 * connected. A request with no session cookie never touches the store.
 */
class LazyMongoStore extends session.Store {
  private store?: MongoStore;

  constructor(private readonly getClient: () => ConnectionClient) {
    super();
  }

  private open(): MongoStore {
    this.store ??= MongoStore.create({
      client: this.getClient() as unknown as StoreClient,
      collectionName: SESSIONS_COLLECTION,
      ttl: (LIMITS.sessionRollingDays * DAY_MS) / 1000,
      autoRemove: "native",
    });
    return this.store;
  }

  private run(
    callback: ((error?: unknown) => void) | undefined,
    action: (store: MongoStore) => void,
  ) {
    try {
      action(this.open());
    } catch (error) {
      callback?.(error);
    }
  }

  override get(
    sid: string,
    callback: (error: unknown, session?: session.SessionData | null) => void,
  ) {
    this.run(callback, (store) => {
      store.get(sid, callback);
    });
  }

  override set(sid: string, data: session.SessionData, callback?: (error?: unknown) => void) {
    this.run(callback, (store) => {
      store.set(sid, data, callback);
    });
  }

  override touch(sid: string, data: session.SessionData, callback?: (error?: unknown) => void) {
    this.run(callback, (store) => {
      store.touch(sid, data, callback);
    });
  }

  override destroy(sid: string, callback?: (error?: unknown) => void) {
    this.run(callback, (store) => {
      store.destroy(sid, callback);
    });
  }
}

/** Rejects a session older than the absolute limit: drops it and carries on as signed out. */
function enforceAbsoluteLimit(): RequestHandler {
  const limitMs = LIMITS.sessionAbsoluteDays * DAY_MS;
  return (req, res, next) => {
    const { createdAt } = req.session;
    if (createdAt === undefined || Date.now() - createdAt <= limitMs) {
      next();
      return;
    }
    destroySession(req, res).then(() => {
      next();
    }, next);
  };
}

/**
 * Server-side sessions in MongoDB. The cookie is `pp.sid`: httpOnly, `Secure` in production,
 * `SameSite=Lax`, rolling 7 days, with a 30-day absolute limit. Sessions are only stored (and the
 * cookie only issued) once something is written to them, i.e. at sign-in.
 */
export function sessionMiddleware(
  config: Config,
  getClient: () => ConnectionClient,
): RequestHandler {
  const router = express.Router();
  router.use(
    session({
      name: SESSION_COOKIE,
      secret: config.SESSION_SECRET,
      store: new LazyMongoStore(getClient),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: config.isProd,
        sameSite: "lax",
        path: "/",
        maxAge: LIMITS.sessionRollingDays * DAY_MS,
      },
    }),
    enforceAbsoluteLimit(),
  );
  return router;
}

const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error("Session store failed");

/** `req.session` is typed as always present, but it is gone after `destroySession`. */
function maybeSession(req: express.Request): express.Request["session"] | undefined {
  return req.session;
}

/**
 * Replaces the session id (prevents fixation) and records who signed in. Call after the
 * credentials check; any CSRF token issued before sign-in stops matching, so clients refetch it.
 * A sign-in starts a fresh 30-day absolute window. Privilege changes pass `preserveCreatedAt` so
 * regenerating the id never extends the window without signing in again.
 */
export function regenerateSession(
  req: express.Request,
  identity: SessionIdentity,
  { preserveCreatedAt = false }: { preserveCreatedAt?: boolean } = {},
): Promise<void> {
  const previousCreatedAt = maybeSession(req)?.createdAt;
  const createdAt = (preserveCreatedAt ? previousCreatedAt : undefined) ?? Date.now();
  // `destroySession` (or the absolute-limit check) leaves the request without a session.
  if (maybeSession(req) === undefined) req.sessionStore.generate(req);
  return new Promise((resolve, reject) => {
    req.session.regenerate((regenerateError: unknown) => {
      if (regenerateError) {
        reject(asError(regenerateError));
        return;
      }
      req.session.userId = identity.userId;
      req.session.role = identity.role;
      req.session.sessionVersion = identity.sessionVersion;
      req.session.createdAt = createdAt;
      req.session.save((saveError: unknown) => {
        if (saveError) reject(asError(saveError));
        else resolve();
      });
    });
  });
}

/**
 * Deletes the stored session and clears `pp.sid` using the attributes the cookie was set with.
 * Like `req.session.destroy()`, it leaves no session on the request until one is regenerated.
 */
export function destroySession(req: express.Request, res: Response): Promise<void> {
  const current = maybeSession(req);
  if (!current) return Promise.resolve();
  const { path, httpOnly, secure, sameSite } = current.cookie;
  const attributes: CookieOptions = {
    path,
    httpOnly,
    secure: secure === true,
    sameSite,
  };
  return new Promise((resolve, reject) => {
    current.destroy((error: unknown) => {
      if (error) {
        reject(asError(error));
        return;
      }
      res.clearCookie(SESSION_COOKIE, attributes);
      resolve();
    });
  });
}

/** Id of the signed-in user, if any. Safe after `destroySession`, when `req.session` is gone. */
export function sessionUserId(req: express.Request): string | undefined {
  return maybeSession(req)?.userId;
}

/** The `sessionVersion` recorded at sign-in (0 for sessions that predate it). */
export function sessionVersionOf(req: express.Request): number {
  return maybeSession(req)?.sessionVersion ?? 0;
}
