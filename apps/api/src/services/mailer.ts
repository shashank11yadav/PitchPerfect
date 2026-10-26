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

/** A mailer, and the web app's address for emails that link back to a page there. */
export interface LinkingMailer {
  mailer: Mailer;
  config: Pick<Config, "APP_URL">;
}

type SmtpConfig = Pick<
  Config,
  "SMTP_HOST" | "SMTP_PORT" | "SMTP_SECURE" | "SMTP_USER" | "SMTP_PASS" | "MAIL_FROM" | "isProd"
>;

/**
 * Transport settings. Timeouts keep a stuck SMTP server from holding requests open; in production
 * a plain connection must upgrade with STARTTLS or fail, so credentials and links never go out in
 * clear text.
 */
export function smtpTransportOptions(config: SmtpConfig) {
  return {
    host: config.SMTP_HOST ?? "localhost",
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    requireTLS: config.isProd && !config.SMTP_SECURE,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS ?? "" } : undefined,
  };
}

/** Sends through SMTP (Mailpit in development). Every message is from `MAIL_FROM`. */
export function createSmtpMailer(config: SmtpConfig): Mailer {
  const transport = nodemailer.createTransport(smtpTransportOptions(config));
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
