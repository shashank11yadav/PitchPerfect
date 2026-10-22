import { PAGES_EXPORT } from "./pages-export";

/** Next's `searchParams` prop: the page URL's query, read on the server. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * One query value: the first if repeated, `undefined` if missing. The static export has no server
 * to read a query string on, so there every value is missing and its pages read the URL in the
 * browser instead.
 */
export async function queryValue(
  searchParams: SearchParams,
  key: string,
): Promise<string | undefined> {
  if (PAGES_EXPORT) return undefined;
  const value = (await searchParams)[key];
  return Array.isArray(value) ? value[0] : value;
}
