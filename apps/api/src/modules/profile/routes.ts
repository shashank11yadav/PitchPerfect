import { Router, type RequestHandler } from "express";
import {
  ChangeEmailSchema,
  ChangePasswordSchema,
  DeleteAccountSchema,
  EmployerProfileUpdateSchema,
  HOUR_MS,
  PracticeConsentSchema,
  StudentProfileUpdateSchema,
} from "@pitchperfect/shared";
import { requireAuth, requireRole, userOf } from "../../middleware/auth.js";
import { byUser, rateLimit } from "../../middleware/rate-limit.js";
import { uploadResume } from "../../middleware/upload.js";
import { validate } from "../../middleware/validate.js";
import type { CoachProbe } from "../../services/coach-probe.js";
import type { AuthDeps } from "../auth/service.js";
import { profileHandlers } from "./handlers.js";

/** The profile body is checked against the signed-in user's own role. */
function validateProfileByRole(): RequestHandler {
  const forStudent = validate({ body: StudentProfileUpdateSchema });
  const forEmployer = validate({ body: EmployerProfileUpdateSchema });
  return (req, res, next) => {
    (userOf(res).role === "student" ? forStudent : forEmployer)(req, res, next);
  };
}

export interface ProfileDeps extends AuthDeps {
  /** The cached coach health: a practice consent must be for the partner that answers now. */
  coachProbe: CoachProbe;
}

/** `/api/me/*` per docs/api.md (lessons live in their own module). */
export function profileRoutes(deps: ProfileDeps): Router {
  const handle = profileHandlers(deps);
  // These re-check the password, so they must not be a way to guess it: 5 tries an hour per user.
  const limit = (name: string) => rateLimit(name, { windowMs: HOUR_MS, limit: 5, key: byUser });
  const changeEmailLimit = limit("change-email");
  const changePasswordLimit = limit("change-password");
  const deleteAccountLimit = limit("delete-account");
  // Each upload writes up to 2 MB to GridFS; nobody replaces their résumé more than a few times.
  const resumeUploadLimit = rateLimit("resume-upload", {
    windowMs: HOUR_MS,
    limit: 20,
    key: byUser,
  });

  const router = Router();
  router.patch("/me/profile", requireAuth, validateProfileByRole(), handle.updateProfile);
  router.post(
    "/me/change-email",
    requireAuth,
    changeEmailLimit,
    validate({ body: ChangeEmailSchema }),
    handle.email,
  );
  router.post(
    "/me/change-password",
    requireAuth,
    changePasswordLimit,
    validate({ body: ChangePasswordSchema }),
    handle.password,
  );
  router.delete(
    "/me",
    requireAuth,
    deleteAccountLimit,
    validate({ body: DeleteAccountSchema }),
    handle.remove,
  );
  router.put(
    "/me/resume",
    requireRole("student"),
    resumeUploadLimit,
    uploadResume,
    handle.uploadResume,
  );
  router.get("/me/resume", requireRole("student"), handle.downloadResume);
  router.delete("/me/resume", requireRole("student"), handle.deleteResume);
  router.post(
    "/me/practice-consent",
    requireRole("student"),
    validate({ body: PracticeConsentSchema }),
    handle.consent,
  );
  return router;
}
