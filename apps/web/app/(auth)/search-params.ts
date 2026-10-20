/** Next's `searchParams` for the auth pages. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** One query value: the first if repeated, `undefined` if missing. */
export async function queryValue(searchParams: SearchParams, key: string) {
  const value = (await searchParams)[key];
  return Array.isArray(value) ? value[0] : value;
}
