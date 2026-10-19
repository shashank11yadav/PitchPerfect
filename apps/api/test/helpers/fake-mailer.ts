import type { MailMessage, Mailer } from "../../src/services/mailer.js";

/** Records every message instead of sending it. */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}
