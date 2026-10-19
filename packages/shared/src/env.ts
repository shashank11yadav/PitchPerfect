import { z } from "zod";

/**
 * Environment parsing shared by the api and coach services.
 *
 * Server-side only; published as the `@pitchperfect/shared/env` subpath so browser bundles that
 * import the package root never include it.
 */

/** Raised when the environment is invalid. Messages name variables, never their values. */
export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);
    this.name = "ConfigError";
  }
}

export const DEV_ONLY_PREFIX = "dev-only-";
const SECRET_MIN_LENGTH = 32;

/** Environment variables arrive as strings; an empty string means "not set". */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);
export const unsetIfEmpty = <T extends z.ZodType>(schema: T) =>
  z.preprocess(emptyToUndefined, schema);
export const optional = <T extends z.ZodType>(schema: T) => unsetIfEmpty(schema.optional());

export const secret = z
  .string()
  .min(SECRET_MIN_LENGTH, `must be at least ${String(SECRET_MIN_LENGTH)} characters`);

/** Whole number at or above `min`; an empty string counts as unset and yields the default. */
export const integer = (fallback: number, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) =>
  unsetIfEmpty(z.coerce.number().int().min(min).max(max).default(fallback));
export const port = (fallback: number) => integer(fallback, { max: 65535 });

/** Parses `env` with `schema`, or throws a {@link ConfigError} listing the offending variables. */
export function parseConfig<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv): z.output<S> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`),
    );
  }
  return result.data;
}

/** Runs `load`; on a configuration problem prints it to stderr (before any logger exists) and exits 1. */
export function loadConfigOrExit<T>(load: () => T): T {
  try {
    return load();
  } catch (error) {
    const message = error instanceof ConfigError ? error.message : "Could not read configuration";
    process.stderr.write(`${message}\n`);
    return process.exit(1);
  }
}
