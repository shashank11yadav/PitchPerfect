import { z } from "zod";
import { LIMITS } from "../limits.js";
import { countChars, normalizeTurnText, stripInvisible } from "../text.js";

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;
const NAME = /^(?=.*\p{L})[\p{L}\p{M}' ’.-]+$/u;

/** A 24-character hex MongoDB ObjectId string. */
export const objectId = () => z.string().regex(OBJECT_ID, "Invalid id");

/** An https URL, at most 2048 characters, without embedded credentials. */
export const httpsUrl = () =>
  z
    .string()
    .trim()
    .max(LIMITS.urlMaxLength)
    .pipe(
      z.url({ protocol: /^https$/ }).refine((value) => {
        // Unparsable input is already reported by the url check above.
        if (!URL.canParse(value)) return true;
        const url = new URL(value);
        return url.username === "" && url.password === "";
      }, "URLs with credentials are not allowed"),
    );

/** Trimmed, lowercased email address, at most 254 characters. */
export const emailField = () =>
  z.string().trim().toLowerCase().max(LIMITS.emailMaxLength).pipe(z.email());

/** Password for new credentials: 12–128 characters. */
export const newPassword = () =>
  z.string().min(LIMITS.passwordMinLength).max(LIMITS.passwordMaxLength);

/** An existing password being presented for verification: no policy, only a sanity cap. */
export const currentPassword = () => z.string().min(1).max(LIMITS.passwordMaxLength);

/** Single-use token from an email link. */
export const tokenField = () => z.string().min(1).max(LIMITS.tokenMaxLength);

/** Person name: 1–60 characters of letters (any language), spaces, apostrophes, hyphens, periods. */
export const nameField = () => z.string().trim().min(1).max(LIMITS.nameMaxLength).regex(NAME);

/** A string without invisible characters (`stripInvisible`), trimmed. For text people write. */
export const visibleText = () => z.string().overwrite(stripInvisible).trim();

/** Trimmed free text of 1–120 characters. */
export const shortText = () => visibleText().min(1).max(LIMITS.profileTextMaxLength);

/** A student's message: normalized, then 1–1000 characters (counted as code points). */
export const turnText = () =>
  z
    .string()
    .transform(normalizeTurnText)
    .pipe(
      z.string().refine(
        (text) => {
          const length = countChars(text);
          return length >= LIMITS.turnMinChars && length <= LIMITS.turnMaxChars;
        },
        {
          message: `Message must be ${String(LIMITS.turnMinChars)}–${String(LIMITS.turnMaxChars)} characters`,
        },
      ),
    );

/** Query-string pagination: `?page=1&pageSize=20`, page size capped at 50. */
export const pageQuery = z.strictObject({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(LIMITS.pageSizeMax).default(LIMITS.pageSizeDefault),
});
export type PageQuery = z.infer<typeof pageQuery>;

/** Response envelope for list endpoints, for parsing a page of `item`. */
export const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });

/** Response envelope for list endpoints. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
