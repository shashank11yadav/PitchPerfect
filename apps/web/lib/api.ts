import { PracticeEvent } from "@pitchperfect/shared";
import { PAGES_EXPORT } from "./pages-export";

/** An error response from the api, or a failure to reach it (`status` 0). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;
  /** Seconds from a `Retry-After` header (429s), when the api sent one. */
  readonly retryAfterSec: number | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    fields: Record<string, string> = {},
    retryAfterSec?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.fields = fields;
    this.retryAfterSec = retryAfterSec;
  }
}

/** Anything with a zod-style `parse`, so callers can pass shared response schemas. */
export interface Parser<T> {
  parse(data: unknown): T;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiFetchOptions<T> {
  method?: Method;
  /** JSON-serialised, except `FormData`, which is sent as multipart. */
  body?: unknown;
  schema?: Parser<T>;
  signal?: AbortSignal;
}

const FALLBACK_MESSAGE = "Something went wrong";

let csrfToken: Promise<string> | undefined;

/**
 * Forgets the cached CSRF token. Call it after sign-in and sign-out: the api binds the token to
 * the session, so the next state-changing request must fetch a fresh one.
 */
export function resetCsrf(): void {
  csrfToken = undefined;
}

function apiUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(`api paths are absolute paths under /api, got "${path}"`);
  }
  return `/api${path}`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function stringFields(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

/** `Retry-After` in delta-seconds (the only form the api sends). */
function retryAfterOf(res: Response): number | undefined {
  const value = res.headers.get("retry-after")?.trim() ?? "";
  return /^\d+$/.test(value) ? Number(value) : undefined;
}

/** Reads the api's `{ error: { code, message, fields? } }` envelope; anything else is internal. */
export async function toApiError(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => undefined);
  const error = isRecord(body) ? body.error : undefined;
  if (isRecord(error) && typeof error.code === "string") {
    const message = typeof error.message === "string" ? error.message : FALLBACK_MESSAGE;
    return new ApiError(
      res.status,
      error.code,
      message,
      stringFields(error.fields),
      retryAfterOf(res),
    );
  }
  return new ApiError(res.status, "internal_error", FALLBACK_MESSAGE);
}

/** `fetch` on the web origin; network failures become `ApiError` and aborts pass through. */
async function request(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(apiUrl(path), { ...init, credentials: "same-origin" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(
      0,
      "network_error",
      "We couldn’t reach PitchPerfect. Check your connection and try again.",
    );
  }
}

async function fetchCsrfToken(): Promise<string> {
  const res = await request("/auth/csrf", { headers: { accept: "application/json" } });
  if (!res.ok) throw await toApiError(res);
  const body: unknown = await res.json();
  if (!isRecord(body) || typeof body.csrfToken !== "string") {
    throw new ApiError(res.status, "internal_error", FALLBACK_MESSAGE);
  }
  return body.csrfToken;
}

/** The cached token; concurrent callers share one request, and a failed one isn't cached. */
function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const pending = fetchCsrfToken().catch((error: unknown) => {
    if (csrfToken === pending) csrfToken = undefined;
    throw error;
  });
  csrfToken = pending;
  return pending;
}

/**
 * Sends a request with the CSRF token on state-changing methods. A `csrf_failed` response gets one
 * retry with a fresh token, because the token is bound to a session that may have changed.
 */
async function send(
  path: string,
  {
    method = "GET",
    body,
    signal,
    accept,
  }: Omit<ApiFetchOptions<unknown>, "schema"> & { accept: string },
): Promise<Response> {
  const isForm = body instanceof FormData;
  const attempt = async () => {
    const headers = new Headers({ accept });
    if (body !== undefined && !isForm) headers.set("content-type", "application/json");
    if (method !== "GET") headers.set("x-csrf-token", await getCsrfToken());
    return request(path, {
      method,
      headers,
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
      signal,
    });
  };

  let res = await attempt();
  if (!res.ok) {
    const error = await toApiError(res);
    if (method === "GET" || error.code !== "csrf_failed") throw error;
    resetCsrf();
    res = await attempt();
    if (!res.ok) throw await toApiError(res);
  }
  return res;
}

/**
 * Calls the api on the web origin and returns its JSON body (`undefined` for 204). The static
 * demo has no api: there, the practice routes are answered in the browser (lib/demo), loaded
 * only in that build.
 */
export async function apiFetch<T = unknown>(
  path: string,
  { schema, ...options }: ApiFetchOptions<T> = {},
): Promise<T> {
  if (PAGES_EXPORT) {
    const { demoFetch } = await import("./demo/demo-api");
    return demoFetch<T>(path, { ...options, ...(schema && { schema }) });
  }
  const res = await send(path, { ...options, accept: "application/json" });
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json();
  return schema ? schema.parse(data) : (data as T);
}

/** One SSE message (lines up to a blank line) as a `PracticeEvent`, or null for comments only. */
function parseMessage(block: string): PracticeEvent | null {
  let type = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line === "" || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") type = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(data.join("\n"));
  } catch {
    payload = undefined;
  }
  const parsed = PracticeEvent.safeParse(isRecord(payload) ? { ...payload, type } : undefined);
  if (!parsed.success) {
    throw new ApiError(
      502,
      "upstream_error",
      "The practice partner sent a reply we couldn’t read.",
    );
  }
  return parsed.data;
}

/**
 * POSTs `body` and reads the `text/event-stream` response, calling `onEvent` for each validated
 * event as it arrives. Resolves when the stream ends.
 */
export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: PracticeEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (PAGES_EXPORT) {
    const { demoStream } = await import("./demo/demo-api");
    return demoStream(path, body, onEvent, signal);
  }
  const res = await send(path, { method: "POST", body, signal, accept: "text/event-stream" });
  if (!res.body) return;

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  /** Emits every complete message; `final` also emits a last message without a blank line. */
  const flush = (final: boolean) => {
    // A trailing CR may be the first half of a CRLF split across chunks.
    const end = !final && buffer.endsWith("\r") ? buffer.length - 1 : buffer.length;
    const blocks = buffer.slice(0, end).replace(/\r\n?/g, "\n").split("\n\n");
    const rest = final ? "" : (blocks.pop() ?? "");
    buffer = rest + buffer.slice(end);
    for (const block of blocks) {
      const event = parseMessage(block);
      if (event) onEvent(event);
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      flush(false);
    }
    flush(true);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
}
