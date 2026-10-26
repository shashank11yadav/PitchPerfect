import { AUTHOR } from "@pitchperfect/shared";
import Link from "next/link";
import { LEGAL_NAV, PUBLIC_NAV, SITE_NAME, TAGLINE, type NavLink } from "@/lib/site";
import { Logo } from "./Logo";

const EXTERNAL_LINK = "pp-link rounded-control font-semibold text-white";

function LinkColumn({ title, links }: { title: string; links: readonly NavLink[] }) {
  return (
    <div>
      <h2 className="text-small font-semibold text-white">{title}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className="pp-link rounded-control text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The footer: wordmark, tagline, site links, the legal line and who built it, on navy. */
export function Footer() {
  return (
    <footer className="pp-on-dark bg-navy text-white">
      <div className="mx-auto grid w-full max-w-wide gap-10 px-4 py-16 sm:px-6 md:grid-cols-12 md:gap-x-6 md:py-20 lg:px-8">
        <div className="md:col-span-5">
          <Logo inverted />
          <p className="mt-4 max-w-xs text-white">{TAGLINE}</p>
        </div>
        <div className="grid grid-cols-2 gap-6 md:col-span-6 md:col-start-7">
          <LinkColumn title="Product" links={PUBLIC_NAV} />
          <LinkColumn title="Company" links={LEGAL_NAV} />
        </div>
        <div className="flex flex-col gap-2 text-small text-white sm:flex-row sm:justify-between md:col-span-12">
          <p>
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
          <p>
            Built by {AUTHOR.name} ·{" "}
            <a href={AUTHOR.github} rel="noopener noreferrer" className={EXTERNAL_LINK}>
              GitHub
            </a>{" "}
            ·{" "}
            <a href={AUTHOR.website} rel="noopener noreferrer" className={EXTERNAL_LINK}>
              shashankyadav.dev
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
