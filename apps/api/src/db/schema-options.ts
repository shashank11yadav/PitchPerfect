import type { SchemaOptions } from "mongoose";

/**
 * Options shared by every model: timestamps, and a `toJSON` transform that drops `__v`
 * plus any secret fields, so a document can never leak them by being serialized.
 */
export function schemaOptions(secretFields: readonly string[] = []): SchemaOptions {
  return {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        const hidden = new Set(["__v", ...secretFields]);
        return Object.fromEntries(Object.entries(ret).filter(([key]) => !hidden.has(key)));
      },
    },
  };
}
