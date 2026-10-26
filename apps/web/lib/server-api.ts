import "server-only";
import { ApiError, toApiError, type Parser } from "./api";
import { proxySecret } from "./proxy-secret";

const TIMEOUT_MS = 5_000;

/**
 * Calls the api directly from the server (pages, sitemap), never cached, and parses the JSON body
 * with `schema`. Error responses and network failures (status 0) throw `ApiError`.
 */
export async function serverApi<T>(path: string, schema: Parser<T>): Promise<T> {
  if (!path.startsWith("/api/")) {
    throw new Error(`server api paths start with /api/, got "${path}"`);
  }
  const origin = new URL(process.env.API_ORIGIN ?? "http://localhost:4000").origin;
  const headers = new Headers({ accept: "application/json" });
  const secret = proxySecret();
  if (secret) headers.set("x-pp-proxy", secret);

  let res: Response;
  try {
    res = await fetch(`${origin}${path}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(0, "network_error", "The api could not be reached");
  }
  if (!res.ok) throw await toApiError(res);
  return schema.parse(await res.json());
}
