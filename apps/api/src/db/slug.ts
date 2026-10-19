const MAX_BASE_LENGTH = 60;

/** `"Senior SDR — Boston!"` + `"a1b2c3"` → `"senior-sdr-boston-a1b2c3"`. Base is ascii, hyphenated, ≤ 60 chars. */
export function slugify(title: string, suffix: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_BASE_LENGTH)
    .replace(/-+$/, "");
  return base === "" ? suffix : `${base}-${suffix}`;
}
