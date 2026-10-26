import type { RequestHandler } from "express";
import type {
  ChangeEmailSchema,
  ChangePasswordSchema,
  DeleteAccountSchema,
  EmployerProfileUpdateSchema,
  PracticeConsentSchema,
  StudentProfileUpdateSchema,
} from "@pitchperfect/shared";
import { ValidationError } from "../../errors.js";
import { userOf } from "../../middleware/auth.js";
import { destroySession, regenerateSession, sessionVersionOf } from "../../middleware/session.js";
import { getInput } from "../../middleware/validate.js";
import { practicePartnerOf } from "../../services/coach-probe.js";
import { streamResume } from "../../services/files.js";
import type { ProfileDeps } from "./routes.js";
import { changePassword, requireCurrentPassword } from "./credentials.js";
import { deleteAccount } from "./deletion.js";
import { requestEmailChange } from "./email-change.js";
import {
  recordPracticeConsent,
  removeResume,
  replaceResume,
  resumeFileIdOf,
  updateEmployerProfile,
  updateStudentProfile,
} from "./service.js";

const OK = { ok: true } as const;

/** Thin handlers: read validated input, call the service, respond. */
export function profileHandlers(deps: ProfileDeps) {
  const updateProfile: RequestHandler = async (_req, res) => {
    const { id, role } = userOf(res);
    if (role === "student") {
      const { body } = getInput<{ body: typeof StudentProfileUpdateSchema }>(res);
      res.json(await updateStudentProfile(id, body));
    } else {
      const { body } = getInput<{ body: typeof EmployerProfileUpdateSchema }>(res);
      res.json(await updateEmployerProfile(id, body));
    }
  };

  const password: RequestHandler = async (req, res) => {
    const { body } = getInput<{ body: typeof ChangePasswordSchema }>(res);
    const identity = await changePassword(deps, userOf(res).id, body);
    // Every other session is now revoked; this one gets the new version and a fresh id.
    await regenerateSession(req, identity, { preserveCreatedAt: true });
    res.json(OK);
  };

  const email: RequestHandler = async (req, res) => {
    const { body } = getInput<{ body: typeof ChangeEmailSchema }>(res);
    const { id, role } = userOf(res);
    await requestEmailChange(deps, req.log, id, body);
    // The password was just checked: a new session id, as after a password change, whether or
    // not the address was free, so the answers can't be told apart.
    const identity = { userId: id, role, sessionVersion: sessionVersionOf(req) };
    await regenerateSession(req, identity, { preserveCreatedAt: true });
    res.json(OK);
  };

  const remove: RequestHandler = async (req, res) => {
    const { body } = getInput<{ body: typeof DeleteAccountSchema }>(res);
    const user = userOf(res);
    await requireCurrentPassword(user.id, body.currentPassword);
    await deleteAccount(deps, req.log, user);
    await destroySession(req, res);
    res.status(204).end();
  };

  const consent: RequestHandler = async (_req, res) => {
    const { body } = getInput<{ body: typeof PracticeConsentSchema }>(res);
    const current = practicePartnerOf(await deps.coachProbe());
    res.json(await recordPracticeConsent(userOf(res).id, body.partner, current));
  };

  const uploadResume: RequestHandler = async (req, res) => {
    if (!req.file) throw new ValidationError({ file: "Choose a PDF to upload" });
    res.json({ resume: await replaceResume(userOf(res).id, req.file.buffer) });
  };

  const downloadResume: RequestHandler = async (_req, res) => {
    await streamResume(await resumeFileIdOf(userOf(res).id), res);
  };

  const deleteResume: RequestHandler = async (_req, res) => {
    await removeResume(userOf(res).id);
    res.status(204).end();
  };

  return {
    updateProfile,
    password,
    email,
    remove,
    consent,
    uploadResume,
    downloadResume,
    deleteResume,
  };
}
