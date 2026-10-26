/**
 * A cookie's name: `__Host-<name>` when it is `Secure` (production), the plain name otherwise
 * (development over http, where browsers refuse the prefix). Browsers accept a `__Host-` cookie
 * only with `Secure`, `Path=/` and no `Domain`, so no other host, such as a sibling subdomain, can
 * set or overwrite it.
 */
export const cookieName = (name: string, secure: boolean): string =>
  secure ? `__Host-${name}` : name;
