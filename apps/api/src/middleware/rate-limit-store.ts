import { createHash } from "node:crypto";
import mongoose from "mongoose";
import type { ClientRateLimitInfo, Options, Store } from "express-rate-limit";

const RATE_LIMITS_COLLECTION = "ratelimits";

interface CounterDoc {
  _id: string;
  hits: number;
  /** End of the current window; a TTL index removes the document shortly after. */
  resetAt: Date;
}

/**
 * Fixed-window counters in a Mongo collection. One document per key, updated by a single atomic
 * `findOneAndUpdate`, so concurrent requests (and several api instances) never lose a hit.
 * Documents linger up to a minute past `resetAt` until the TTL monitor runs, so an increment on an
 * expired document starts a fresh window instead of counting into the old one.
 */
class MongoRateLimitStore implements Store {
  /** Keys live in a database, so they are shared between instances of this store. */
  localKeys = false;
  prefix: string;
  private windowMs = 60_000;
  private ready?: Promise<unknown>;

  constructor(name: string) {
    this.prefix = `${name}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private get counters() {
    return mongoose.connection.collection<CounterDoc>(RATE_LIMITS_COLLECTION);
  }

  /** Creates the TTL index once; retried if the first attempt fails. */
  private ensureIndex(): Promise<unknown> {
    this.ready ??= this.counters
      .createIndex({ resetAt: 1 }, { expireAfterSeconds: 0 })
      .catch((error: unknown) => {
        this.ready = undefined;
        throw error;
      });
    return this.ready;
  }

  /** Keys may contain emails or addresses; only their sha256 is stored. */
  private idFor(key: string): string {
    return `${this.prefix}${createHash("sha256").update(key).digest("hex")}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    await this.ensureIndex();
    const now = new Date();
    const windowEnd = new Date(now.getTime() + this.windowMs);
    const live = { $gt: ["$resetAt", now] };
    const doc = await this.counters.findOneAndUpdate(
      { _id: this.idFor(key) },
      [
        {
          $set: {
            hits: { $cond: [live, { $add: ["$hits", 1] }, 1] },
            resetAt: { $cond: [live, "$resetAt", windowEnd] },
          },
        },
      ],
      { upsert: true, returnDocument: "after" },
    );
    if (!doc) throw new Error("rate limit counter was not written");
    return { totalHits: doc.hits, resetTime: doc.resetAt };
  }

  async decrement(key: string): Promise<void> {
    await this.counters.updateOne(
      { _id: this.idFor(key), hits: { $gt: 0 } },
      { $inc: { hits: -1 } },
    );
  }

  async resetKey(key: string): Promise<void> {
    await this.counters.deleteOne({ _id: this.idFor(key) });
  }
}

/** The one place that picks where counters live; swap this for a Redis store to share across hosts. */
export function createRateLimitStore(name: string): Store {
  return new MongoRateLimitStore(name);
}
