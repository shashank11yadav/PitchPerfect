import { z } from "zod";

const dependency = z.enum(["ok", "down"]);

/**
 * `GET /api/health`: liveness for probes. The api answers `200` whatever the dependencies say; a
 * down one is data. It says nothing about how the deployment is configured.
 */
export const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  db: dependency,
  coach: dependency,
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
