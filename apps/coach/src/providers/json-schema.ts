import { z, type ZodType } from "zod";

type JsonSchema = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonSchema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Keywords whose value is a schema, an array of schemas, or a name → schema map.
const SCHEMA_KEYWORDS = new Set(["items", "additionalProperties", "not", "if", "then", "else"]);
const SCHEMA_LIST_KEYWORDS = new Set(["anyOf", "oneOf", "allOf", "prefixItems"]);
const SCHEMA_MAP_KEYWORDS = new Set(["properties", "definitions", "$defs", "patternProperties"]);

type Visit = (schema: JsonSchema) => JsonSchema;

function mapEntries(map: JsonSchema, visit: Visit): JsonSchema {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, mapSchema(v, visit)]));
}

/** Rebuilds a schema tree bottom-up, letting `visit` rewrite each (sub)schema. */
function mapSchema(node: unknown, visit: Visit): unknown {
  if (!isRecord(node)) return node;
  const copy: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (SCHEMA_KEYWORDS.has(key)) {
      copy[key] = Array.isArray(value)
        ? value.map((v) => mapSchema(v, visit))
        : mapSchema(value, visit);
    } else if (SCHEMA_LIST_KEYWORDS.has(key) && Array.isArray(value)) {
      copy[key] = value.map((v) => mapSchema(v, visit));
    } else if (SCHEMA_MAP_KEYWORDS.has(key) && isRecord(value)) {
      copy[key] = mapEntries(value, visit);
    } else {
      copy[key] = value;
    }
  }
  return visit(copy);
}

/** `anyOf: [{ type: T, const: a }, { type: T, const: b }]` → `{ type: T, enum: [a, b] }`. */
function collapseConstUnion(schema: JsonSchema): JsonSchema {
  const { anyOf, ...rest } = schema;
  if (!Array.isArray(anyOf) || anyOf.length === 0) return schema;
  const branches = anyOf.filter(isRecord);
  const type = branches[0]?.type;
  const allConst =
    branches.length === anyOf.length &&
    branches.every((b) => Object.keys(b).length === 2 && "const" in b && b.type === type);
  return allConst ? { ...rest, type, enum: branches.map((b) => b.const) } : schema;
}

/**
 * JSON Schema (draft-07) for what the model must produce, i.e. the zod schema's input side.
 * Refinements are not representable; callers always validate the result with zod afterwards.
 */
export function toJsonSchema(schema: ZodType): JsonSchema {
  const json = z.toJSONSchema(schema, {
    target: "draft-7",
    io: "input",
    unrepresentable: "throw",
  }) as JsonSchema;
  delete json.$schema;
  return mapSchema(json, collapseConstUnion) as JsonSchema;
}

// Strict structured outputs reject these; zod still enforces them after the call.
const DROPPED_IN_STRICT = ["minLength", "maxLength"];
// Keywords strict mode cannot express, so the schema is sent non-strict instead.
const NOT_STRICT = ["allOf", "not", "if", "then", "else", "patternProperties", "propertyNames"];

/**
 * The schema in the shape strict structured outputs require: every object closed and every
 * property required. When the schema cannot be expressed that way (optional properties,
 * open objects, unsupported keywords) it is returned unchanged with `strict: false`.
 */
export function toStrictJsonSchema(schema: ZodType): { schema: JsonSchema; strict: boolean } {
  const plain = toJsonSchema(schema);
  const blockers: string[] = [];
  const strictSchema = mapSchema(plain, (node) => {
    blockers.push(...NOT_STRICT.filter((keyword) => keyword in node));
    const copy = Object.fromEntries(
      Object.entries(node).filter(([keyword]) => !DROPPED_IN_STRICT.includes(keyword)),
    );
    if (copy.type !== "object") return copy;
    if ("additionalProperties" in copy && copy.additionalProperties !== false) {
      blockers.push("additionalProperties");
    }
    const keys = Object.keys(isRecord(copy.properties) ? copy.properties : {});
    const required = Array.isArray(copy.required) ? copy.required : [];
    if (keys.some((key) => !required.includes(key))) blockers.push("optional property");
    return { ...copy, additionalProperties: false };
  }) as JsonSchema;
  return blockers.length === 0
    ? { schema: strictSchema, strict: true }
    : { schema: plain, strict: false };
}
