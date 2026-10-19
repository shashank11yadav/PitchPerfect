import { Router } from "express";
import type { Csrf } from "../../middleware/csrf.js";

/** `GET /api/auth/csrf`: hands the browser its token and sets the paired cookie. */
export function csrfRoutes({ issueCsrfToken }: Pick<Csrf, "issueCsrfToken">): Router {
  const router = Router();
  router.get("/auth/csrf", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ csrfToken: issueCsrfToken(req, res) });
  });
  return router;
}
