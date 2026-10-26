/**
 * Runs once as the server starts. In the Node.js runtime, a production server without
 * `PROXY_SHARED_SECRET` exits here instead of proxying to the api without it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { requireProxySecret } = await import("@/lib/require-proxy-secret");
  requireProxySecret();
}
