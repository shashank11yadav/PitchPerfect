/**
 * A static file server for the exported demo, the way GitHub Pages serves a project site: files
 * under `--base`, `index.html` for a directory, a redirect from a path without its trailing
 * slash, and the export's 404 page for anything else. Node built-ins only.
 *
 *   node e2e/pages/static-server.mjs --dir apps/web/out --base /PitchPerfect --port 3100
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    base: { type: "string", default: "/" },
    port: { type: "string", default: "3100" },
  },
});
if (!values.dir) throw new Error("--dir is required");
const root = resolve(values.dir);
const base = values.base.replace(/\/+$/, "");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

/** The file under `root` for a request path, or undefined when there is none. */
function fileFor(pathname) {
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = join(root, relative);
  if (!candidate.startsWith(root) || !existsSync(candidate)) return undefined;
  const stats = statSync(candidate);
  if (stats.isDirectory()) {
    const index = join(candidate, "index.html");
    return existsSync(index) ? index : undefined;
  }
  return candidate;
}

function send(res, status, file) {
  res.writeHead(status, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/" && base !== "") {
    res.writeHead(302, { location: `${base}/` });
    res.end();
    return;
  }
  if (base !== "" && !url.pathname.startsWith(`${base}/`) && url.pathname !== base) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
    return;
  }
  const inside = url.pathname === base ? "/" : url.pathname.slice(base.length);
  const file = fileFor(inside);
  if (file) {
    send(res, 200, file);
    return;
  }
  // A directory asked for without its slash: Pages answers with a redirect.
  if (!inside.endsWith("/") && fileFor(`${inside}/`)) {
    res.writeHead(301, { location: `${base}${inside}/${url.search}` });
    res.end();
    return;
  }
  const notFound = fileFor("/404.html");
  if (notFound) send(res, 404, notFound);
  else {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(Number(values.port), "127.0.0.1");
