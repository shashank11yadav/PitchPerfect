import { pino, type DestinationStream, type Logger } from "pino";

/** Per docs/security.md: never log credentials, signatures, or transcript text. */
const REDACT_PATHS = [
  "req.headers.authorization",
  'req.headers["x-pp-signature"]',
  "*.text",
  "*.studentText",
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino({ level, redact: { paths: REDACT_PATHS, censor: "[Redacted]" } }, destination);
}
