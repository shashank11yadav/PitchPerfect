import type { RequestHandler } from "express";
import { dashboardFor } from "./dashboard.service.js";
import { companyOf } from "./ownership.js";

export const dashboardHandlers = {
  get: (async (_req, res) => {
    res.json(await dashboardFor(companyOf(res)));
  }) satisfies RequestHandler,
};
