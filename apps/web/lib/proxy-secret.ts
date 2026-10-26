const SECRET_MIN_LENGTH = 32;

/**
 * `PROXY_SHARED_SECRET`, which web sends to the api as `x-pp-proxy` (docs/deploy.md); `undefined`
 * when it isn't set. It is required unless `NODE_ENV` is `development` (`next dev`) or `test`:
 * `next start` and the container run as production, and there a missing or short secret throws.
 * `instrumentation.ts` calls this at startup, so such a server refuses to start, like the api
 * does without its own copy.
 */
export function proxySecret(): string | undefined {
  const secret = process.env.PROXY_SHARED_SECRET ?? "";
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "development" || nodeEnv === "test") return secret || undefined;
  if (secret.length < SECRET_MIN_LENGTH) {
    throw new Error(
      `PROXY_SHARED_SECRET is required in production: at least ${String(SECRET_MIN_LENGTH)} characters, the same value as the api’s`,
    );
  }
  return secret;
}
