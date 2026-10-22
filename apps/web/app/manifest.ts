import type { MetadataRoute } from "next";
import { staticMetadataRoute, withBasePath } from "@/lib/pages-export";

import { SITE_NAME, TAGLINE } from "@/lib/site";

/** Pre-rendered in the static export only; see `staticMetadataRoute`. */
export const generateStaticParams = staticMetadataRoute;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: TAGLINE,
    start_url: withBasePath("/"),
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#3f56d2",
    icons: [
      { src: withBasePath("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: withBasePath("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
  };
}
