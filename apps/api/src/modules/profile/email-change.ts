import type { ChangeEmail } from "@pitchperfect/shared";
import { ConflictError } from "../../errors.js";
import type { SessionIdentity } from "../../middleware/session.js";
import * as emails from "../../services/email-templates.js";
import {
  sendSafely,
  type MailFailureLog,
  type MailMessage,
  type Mailer,
} from "../../services/mailer.js";
import { appLink, isDuplicateKey, type AuthDeps } from "../auth/service.js";
import { changeEmail } from "./credentials.js";

/**
 * Holds what a request emails until it has its answer, then sends it without waiting. The answer
 * then takes as long whether one email goes out or two, and however slow the mail server is.
 */
function outbox(mailer: Mailer, log: MailFailureLog) {
  const held: MailMessage[] = [];
  return {
    mailer: {
      send: (message: MailMessage) => {
        held.push(message);
        return Promise.resolve();
      },
    } satisfies Mailer,
    sendAll: () => {
      for (const message of held) void sendSafely(mailer, message, log, "change_email");
    },
  };
}

const isTaken = (error: unknown) =>
  (error instanceof ConflictError && error.code === "email_taken") ||
  isDuplicateKey(error, "email");

/**
 * `POST /api/me/change-email`, answered the same way whether or not the new address has an
 * account, like sign-up. A free address gets the change, a verification link, and a notice to the
 * old address. An address in use changes nothing: its owner gets a notice instead of a link, and
 * the caller keeps the identity they have. Either way the emails go out after the answer.
 */
export async function requestEmailChange(
  deps: AuthDeps,
  log: MailFailureLog,
  current: SessionIdentity,
  input: ChangeEmail,
): Promise<SessionIdentity> {
  const mail = outbox(deps.mailer, log);
  try {
    const identity = await changeEmail(
      { ...deps, mailer: mail.mailer },
      log,
      current.userId,
      input,
    );
    mail.sendAll();
    return identity;
  } catch (error) {
    if (!isTaken(error)) throw error;
  }
  const content = emails.emailChangeToExistingAccount(
    appLink(deps.config, "/signin"),
    appLink(deps.config, "/forgot-password"),
  );
  void sendSafely(deps.mailer, { to: input.newEmail, ...content }, log, "change_email_existing");
  return current;
}
