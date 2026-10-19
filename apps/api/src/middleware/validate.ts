import type { RequestHandler, Response } from "express";
import { objectId } from "@pitchperfect/shared";
import { z } from "zod";
import { ValidationError, type ErrorFields } from "../errors.js";

/** `:id` route parameter that must be a 24-character hex ObjectId. */
export const IdParamSchema = z.strictObject({ id: objectId() });

interface Schemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
}

type Input<S extends Schemas> = { [K in keyof S]: S[K] extends z.ZodType ? z.output<S[K]> : never };

const SOURCES = ["params", "query", "body"] as const;

/** Flattens zod issues to `{ field: message }`; the first issue for a field wins. */
export function fieldErrors(issues: z.core.$ZodIssue[]): ErrorFields {
  const fields: ErrorFields = {};
  for (const issue of issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) fields[[...issue.path, key].join(".")] ??= "Unknown field";
    } else {
      fields[issue.path.join(".") || "_"] ??= issue.message;
    }
  }
  return fields;
}

/** Parses params, query, and body with the given schemas and stores the results on `res.locals.input`. */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const input: Record<string, unknown> = {};
    const issues: z.core.$ZodIssue[] = [];
    for (const source of SOURCES) {
      const schema = schemas[source];
      if (!schema) continue;
      const result = schema.safeParse(req[source] ?? {});
      if (result.success) input[source] = result.data;
      else issues.push(...result.error.issues);
    }
    if (issues.length > 0) {
      next(new ValidationError(fieldErrors(issues)));
      return;
    }
    res.locals.input = input;
    next();
  };
}

/** Typed access to what `validate()` stored: `getInput<typeof schemas>(res).body`. */
export function getInput<S extends Schemas>(res: Response): Input<S> {
  return res.locals.input as Input<S>;
}
