import type { RequestHandler } from "express";
import type { CompanyUpdateSchema } from "@pitchperfect/shared";
import { toPublicCompany } from "../../db/mappers.js";
import { getInput } from "../../middleware/validate.js";
import { updateCompany } from "./company.service.js";
import { companyOf } from "./ownership.js";

export const companyHandlers = {
  get: ((_req, res) => {
    res.json({ company: toPublicCompany(companyOf(res)) });
  }) satisfies RequestHandler,

  update: (async (_req, res) => {
    const { body } = getInput<{ body: typeof CompanyUpdateSchema }>(res);
    res.json({ company: await updateCompany(companyOf(res), body) });
  }) satisfies RequestHandler,
};
