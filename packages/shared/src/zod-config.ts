import { z } from "zod";

/**
 * Imported first by the package entry, before any schema is built. Without it, zod probes for
 * `new Function` the first time it compiles an object schema; under the web app's CSP (no
 * 'unsafe-eval') that probe is reported as a violation even though zod catches the error. Jitless
 * parsing is a little slower, which doesn't matter at our request sizes, and it means client
 * components can import shared schemas safely.
 */
z.config({ jitless: true });
