export interface ErrorBody {
  code: string;
  message: string;
  requestId: string;
  fields?: Record<string, string>;
}

/** Typed view of the `{ error }` envelope on a supertest response. */
export function errorOf(res: { body: unknown }): ErrorBody {
  return (res.body as { error: ErrorBody }).error;
}
