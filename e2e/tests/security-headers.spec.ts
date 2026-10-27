import { expect, test } from "../helpers/fixtures";
import { cspNonce, expectHealthy, expectPageSecurityHeaders } from "../helpers/headers";

for (const path of ["/", "/jobs", "/signin"]) {
  test(`${path} sends the security headers`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expectPageSecurityHeaders(response);
  });
}

test("the CSP nonce is new on every request and stamped on the page's own scripts", async ({
  request,
}) => {
  const first = await request.get("/");
  const second = await request.get("/");
  const nonces = [first, second].map((response) =>
    cspNonce(response.headers()["content-security-policy"]),
  );
  expect(nonces[0]).toBeDefined();
  expect(nonces[1]).toBeDefined();
  expect(nonces[0]).not.toBe(nonces[1]);

  // Every script tag in the server's HTML carries this response's nonce. (Scripts those load
  // later are trusted through 'strict-dynamic'; JSON-LD is data, not script.)
  const html = await second.text();
  const tags = (html.match(/<script\b[^>]*>/g) ?? []).filter(
    (tag) => !tag.includes("application/ld+json"),
  );
  expect(tags.length).toBeGreaterThan(0);
  for (const tag of tags) expect(tag).toContain(`nonce="${nonces[1] ?? ""}"`);
});

test("public pages can be restored on Back and Forward; sign-in pages are never stored", async ({
  request,
}) => {
  const html = { accept: "text/html" };
  for (const path of ["/", "/jobs", "/students"]) {
    const response = await request.get(path, { headers: html });
    // `no-cache` keeps them fresh; `no-store` would keep them out of the back/forward cache.
    expect(response.headers()["cache-control"], path).toBe("private, no-cache");
  }
  const signin = await request.get("/signin", { headers: html });
  expect(signin.headers()["cache-control"]).toBe("private, no-store");
});

test("the api answers through the web origin, without leaking its framework", async ({
  request,
}) => {
  await expectHealthy(await request.get("/api/health"));
});

test("signed-out visitors are sent from the app to sign in", async ({ request }) => {
  const response = await request.get("/app", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(/\/signin\?next=%2Fapp$/);
});
