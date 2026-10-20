import type { Page } from "@pitchperfect/shared";
import { ApiError, type Parser } from "./api";

/**
 * Helpers for parsers of api answers that have shared TypeScript types but no zod schemas: each
 * parser checks the envelope its view depends on and trusts the api for the rest.
 */

export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Reported like any other bad answer. */
export const unexpected = (what: string) =>
  new ApiError(502, "internal_error", `Unexpected ${what} response`);

/** `{ items, page, pageSize, total }`. */
export function pageOf<T>(what: string): Parser<Page<T>> {
  return {
    parse(data) {
      if (
        isObject(data) &&
        Array.isArray(data.items) &&
        typeof data.page === "number" &&
        typeof data.pageSize === "number" &&
        typeof data.total === "number"
      ) {
        return data as unknown as Page<T>;
      }
      throw unexpected(what);
    },
  };
}
