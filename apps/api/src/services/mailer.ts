import nodemailer from "nodemailer";
import type { Config } from "../config.js";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

type SmtpConfig = Pick<
  Config,
  "SMTP_HOST" | "SMTP_PORT" | "SMTP_SECURE" | "SMTP_USER" | "SMTP_PASS" | "MAIL_FROM"
>;

/** Sends through SMTP (Mailpit in development). Every message is from `MAIL_FROM`. */
export function createSmtpMailer(config: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST ?? "localhost",
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ...(config.SMTP_USER && { auth: { user: config.SMTP_USER, pass: config.SMTP_PASS ?? "" } }),
  });
  return {
    async send(message) {
      await transport.sendMail({ from: config.MAIL_FROM, ...message });
    },
  };
}

/** The slice of a logger `sendSafely` needs; pino's `req.log` fits. */
export interface MailFailureLog {
  error(details: object, message: string): void;
}

/** Only the error's class and code: transport messages often quote the recipient address. */
function describeFailure(error: unknown): { name: string; code?: string } {
  if (!(error instanceof Error)) return { name: "unknown" };
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? { name: error.name, code } : { name: error.name };
}

/**
 * Sends and never throws: a failed email must not change what the client sees (that would leak
 * whether an account exists). The failure is logged by `kind` only, never with the address,
 * contents, or error message.
 */
export async function sendSafely(
  mailer: Mailer,
  message: MailMessage,
  log: MailFailureLog,
  kind: string,
): Promise<void> {
  try {
    await mailer.send(message);
  } catch (error) {
    log.error({ emailKind: kind, mailError: describeFailure(error) }, "email could not be sent");
  }
}
