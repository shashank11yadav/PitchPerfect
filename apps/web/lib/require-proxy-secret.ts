import { proxySecret } from "./proxy-secret";

/**
 * Ends the server process when `proxySecret()` refuses the environment, so a production server
 * without its proxy secret never starts serving. Node.js runtime only (`instrumentation.ts`).
 */
export function requireProxySecret(): void {
  try {
    proxySecret();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}
