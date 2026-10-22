import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { PAGES_EXPORT, staticMetadataRoute, withBasePath } from "@/lib/pages-export";

import { SITE_URL } from "@/lib/site";

/** Pre-rendered in the static export only; see `staticMetadataRoute`. */
export const generateStaticParams = staticMetadataRoute;

/**
 * Public pages are crawlable; the signed-in areas and the api are not. `/app` and `/employer` are
 * matched exactly or as a folder, so `/employers` and `/apple-icon.png` stay crawlable.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  // Per request, so the sitemap URL follows the runtime SITE_URL. The static demo bakes it.
  if (!PAGES_EXPORT) await connection();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app$", "/app/", "/employer$", "/employer/", "/api/"].map(withBasePath),
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
