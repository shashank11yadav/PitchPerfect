import {
  EMPLOYMENT_TYPES,
  LIMITS,
  WORKPLACES,
  type EmploymentType,
  type Workplace,
} from "@pitchperfect/shared";

/** The job board's filters, as read from the page URL. */
export interface JobQuery {
  q?: string;
  workplace?: Workplace;
  employmentType?: EmploymentType;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Far past any real board; keeps a hand-typed page number sane. */
const MAX_PAGE = 10_000;

/**
 * Reads the board's own parameters and drops anything the api wouldn't accept, so a stray value
 * (or a tracking parameter) never turns the page into an error.
 */
export function parseJobQuery(params: SearchParams): JobQuery {
  const q = first(params.q)?.trim().slice(0, LIMITS.jobSearchMaxLength);
  const workplace = WORKPLACES.find((value) => value === first(params.workplace));
  const employmentType = EMPLOYMENT_TYPES.find((value) => value === first(params.employmentType));
  const page = Number(first(params.page));
  return {
    ...(q && { q }),
    ...(workplace && { workplace }),
    ...(employmentType && { employmentType }),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, MAX_PAGE) : 1,
  };
}

/** The filters as query parameters, in a fixed order. */
function filterParams({ q, workplace, employmentType }: JobQuery): URLSearchParams {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (workplace) params.set("workplace", workplace);
  if (employmentType) params.set("employmentType", employmentType);
  return params;
}

export const hasFilters = (query: JobQuery) => filterParams(query).size > 0;

/** The board's URL for these filters on `page`; page 1 is left implicit. */
export function jobsHref(query: JobQuery, page = query.page): string {
  const params = filterParams(query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/jobs?${search}` : "/jobs";
}

/** `GET /api/jobs` for these filters. */
export function jobsApiPath(query: JobQuery, pageSize: number): string {
  const params = filterParams(query);
  params.set("page", String(query.page));
  params.set("pageSize", String(pageSize));
  return `/api/jobs?${params.toString()}`;
}
