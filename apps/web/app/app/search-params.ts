/** Next's `searchParams` for the student pages. */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `?page=` as a whole number from 1, or 1. */
export async function pageParam(searchParams: SearchParams): Promise<number> {
  const raw = (await searchParams).page;
  const page = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}
