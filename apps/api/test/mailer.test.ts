import { once } from "node:events";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { createSmtpMailer, sendSafely, smtpTransportOptions } from "../src/services/mailer.js";
import { devEnv, prodEnv } from "./helpers/env.js";
import { FakeMailer } from "./helpers/fake-mailer.js";

interface Received {
  commands: string[];
  data: string;
}

/** The smallest SMTP server that accepts one message, so the real transport can be exercised. */
async function startSmtpServer(): Promise<{ server: Server; port: number; received: Received }> {
  const received: Received = { commands: [], data: "" };
  const server = createServer((socket: Socket) => {
    let buffer = "";
    let inData = false;
    socket.write("220 test ESMTP\r\n");
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buffer.indexOf("\r\n.\r\n");
          if (end === -1) return;
          received.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          socket.write("250 queued\r\n");
          continue;
        }
        const lineEnd = buffer.indexOf("\r\n");
        if (lineEnd === -1) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        received.commands.push(line);
        const verb = line.split(" ")[0]?.toUpperCase();
        if (verb === "EHLO" || verb === "HELO") socket.write("250 test\r\n");
        else if (verb === "DATA") {
          inData = true;
          socket.write("354 go ahead\r\n");
        } else if (verb === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, port: (server.address() as AddressInfo).port, received };
}

let running: Server | undefined;

afterEach(async () => {
  if (running) {
    running.close();
    await once(running, "close");
    running = undefined;
  }
});

describe("createSmtpMailer", () => {
  it("sends from MAIL_FROM to the recipient with text and html parts, without auth", async () => {
    const { server, port, received } = await startSmtpServer();
    running = server;
    const config = loadConfig(
      devEnv({
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(port),
        MAIL_FROM: "PitchPerfect <no-reply@pitchperfect.local>",
      }),
    );

    await createSmtpMailer(config).send({
      to: "student@example.test",
      subject: "Hello from the test",
      text: "plain body",
      html: "<p>html body</p>",
    });

    expect(received.commands).toContain("MAIL FROM:<no-reply@pitchperfect.local>");
    expect(received.commands).toContain("RCPT TO:<student@example.test>");
    expect(received.commands.some((command) => command.startsWith("AUTH"))).toBe(false);
    expect(received.data).toContain("Subject: Hello from the test");
    expect(received.data).toContain("plain body");
    expect(received.data).toContain("<p>html body</p>");
  });

  it("rejects when the server can't be reached", async () => {
    const { server, port } = await startSmtpServer();
    server.close();
    await once(server, "close");
    const config = loadConfig(devEnv({ SMTP_HOST: "127.0.0.1", SMTP_PORT: String(port) }));

    await expect(
      createSmtpMailer(config).send({ to: "a@example.test", subject: "s", text: "t", html: "h" }),
    ).rejects.toThrow();
  });
});

describe("smtpTransportOptions", () => {
  it("bounds connection, greeting and socket time", () => {
    expect(smtpTransportOptions(loadConfig(devEnv()))).toMatchObject({
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  });

  it("requires STARTTLS in production when the connection isn't already TLS", () => {
    expect(smtpTransportOptions(loadConfig(prodEnv())).requireTLS).toBe(true);
    expect(smtpTransportOptions(loadConfig(prodEnv({ SMTP_SECURE: "true" }))).requireTLS).toBe(
      false,
    );
    expect(smtpTransportOptions(loadConfig(devEnv())).requireTLS).toBe(false);
  });

  it("sends credentials only when a user is configured", () => {
    expect(smtpTransportOptions(loadConfig(devEnv())).auth).toBeUndefined();
    const withUser = smtpTransportOptions(
      loadConfig(devEnv({ SMTP_USER: "mailer", SMTP_PASS: "placeholder-pass" })),
    );
    expect(withUser.auth).toEqual({ user: "mailer", pass: "placeholder-pass" });
  });
});

describe("sendSafely", () => {
  const message = {
    to: "private.person@example.test",
    subject: "Reset your password",
    text: "token=secret-token-value",
    html: "<p>token=secret-token-value</p>",
  };

  it("sends through the mailer", async () => {
    const mailer = new FakeMailer();
    const logged: unknown[] = [];
    await sendSafely(mailer, message, { error: (...args) => logged.push(args) }, "reset_password");
    expect(mailer.sent).toEqual([message]);
    expect(logged).toEqual([]);
  });

  it("swallows a failure and logs it without the address, body, or error message", async () => {
    const mailer = new FakeMailer();
    mailer.failing = true;
    const logged: unknown[] = [];

    await expect(
      sendSafely(mailer, message, { error: (...args) => logged.push(args) }, "reset_password"),
    ).resolves.toBeUndefined();

    expect(logged).toHaveLength(1);
    const line = JSON.stringify(logged);
    expect(line).toContain("reset_password");
    expect(line).not.toContain("private.person");
    expect(line).not.toContain("secret-token-value");
    expect(line).not.toContain("could not deliver");
  });
});
