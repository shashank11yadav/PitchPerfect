import { pino, type DestinationStream, type Logger } from "pino";

/** Per docs/security.md: never log cookies, credentials, tokens, or transcript text. */
const REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.text",
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACT_PATHS, censor: "[Redacted]" } }, destination);
}
