import { expect } from "@playwright/test";
import { MAILPIT_URL, WEB_URL } from "./stack";

interface MessageSummary {
  ID: string;
  To: { Address: string }[];
}

interface MessageList {
  messages: MessageSummary[];
}

interface Message {
  Text: string;
}

/** Enough to reach back past other mail that arrives while a test waits. */
const PAGE = 100;
const LINK = /https?:\/\/[^\s<>"')\]]+/g;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${MAILPIT_URL}${path}`);
  if (!response.ok) throw new Error(`Mailpit ${path} → ${String(response.status)}`);
  return (await response.json()) as T;
}

/** The newest message to `email`, or undefined while none has arrived. */
async function newestTo(email: string): Promise<Message | undefined> {
  const { messages } = await getJson<MessageList>(`/api/v1/messages?limit=${String(PAGE)}`);
  const address = email.toLowerCase();
  // Mailpit lists newest first.
  const summary = messages.find((message) =>
    message.To.some((to) => to.Address.toLowerCase() === address),
  );
  return summary ? getJson<Message>(`/api/v1/message/${summary.ID}`) : undefined;
}

/**
 * The link to `pathPrefix` (e.g. `/verify-email`) in the newest email to `email`, waiting for the
 * email to arrive. Links in emails are built from `APP_URL`, so they point at the web origin.
 */
export async function latestLinkFor(email: string, pathPrefix: string): Promise<string> {
  const prefix = `${WEB_URL}${pathPrefix}`;
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const message = await newestTo(email);
        link = message?.Text.match(LINK)?.find((url) => url.startsWith(prefix));
        return link;
      },
      { message: `an email to ${email} with a ${pathPrefix} link`, timeout: 15_000 },
    )
    .toBeDefined();
  return link ?? "";
}
