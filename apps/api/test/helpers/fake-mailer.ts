import type { MailMessage, Mailer } from "../../src/services/mailer.js";

/** Records every message instead of sending it. Set `failing` to make sends reject. */
export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  failing = false;

  send(message: MailMessage): Promise<void> {
    if (this.failing) {
      return Promise.reject(new Error(`could not deliver to ${message.to}`));
    }
    this.sent.push(message);
    return Promise.resolve();
  }
}
