import { z } from "zod";
import { PRACTICE_PARTNER_KINDS } from "./practice.js";

const dependency = z.enum(["ok", "down"]);

/** `GET /api/health`. The api answers `200` whatever the dependencies say; a down one is data. */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  db: dependency,
  coach: dependency,
  practicePartner: z.enum(PRACTICE_PARTNER_KINDS),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
