import Link from "next/link";
import { LEGAL_NAV, PUBLIC_NAV, SITE_NAME, TAGLINE, type NavLink } from "@/lib/site";
import { Logo } from "./Logo";
import { Wordmark } from "./Wordmark";

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

/** The close of every page: links on the navy field, and the name set across the full width. */
export function Footer() {
  return (
    <footer className="pp-on-dark overflow-hidden bg-navy text-white">
      <div className="mx-auto grid w-full max-w-wide gap-10 px-4 pt-16 sm:px-6 md:grid-cols-12 md:gap-x-6 md:pt-20 lg:px-8">
        <div className="md:col-span-5">
          <Logo inverted />
          <p className="mt-4 max-w-xs text-white">{TAGLINE}</p>
        </div>
        <div className="grid grid-cols-2 gap-6 md:col-span-6 md:col-start-7">
          <LinkColumn title="Product" links={PUBLIC_NAV} />
          <LinkColumn title="Company" links={LEGAL_NAV} />
        </div>
        <p className="text-small text-white md:col-span-12">
          © {new Date().getFullYear()} {SITE_NAME}
        </p>
      </div>
      <div className="mx-auto w-full max-w-wide px-4 sm:px-6 lg:px-8">
        <Wordmark className="mt-10 -mb-[4.5%] block w-full translate-y-[18%] text-white/10" />
      </div>
    </footer>
  );
}
