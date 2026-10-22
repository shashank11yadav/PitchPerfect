import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_NAME, TAGLINE } from "@/lib/site";
import { staticMetadataRoute } from "@/lib/pages-export";

export const alt = `${SITE_NAME}: ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  // The white wordmark is outlined paths, so it renders without loading a font.
  const logo = await readFile(join(process.cwd(), "public/brand/logo-white.svg"));
  const logoSrc = `data:image/svg+xml;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 96px",
        gap: 40,
        background: "linear-gradient(135deg, #2d3c90 0%, #1d275e 100%)",
        color: "#ffffff",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
      <img src={logoSrc} width={664} height={128} alt="" />
      <div style={{ fontSize: 56, fontWeight: 700 }}>{TAGLINE}</div>
    </div>,
    size,
  );
}

/** Pre-rendered in the static export only; see `staticMetadataRoute`. */
export const generateStaticParams = staticMetadataRoute;
