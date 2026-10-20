import Link from "next/link";
import { LEGAL_NAV, PUBLIC_NAV, SITE_NAME, TAGLINE, type NavLink } from "@/lib/site";
import { Logo } from "./Logo";

function LinkColumn({ title, links }: { title: string; links: readonly NavLink[] }) {
  return (
    <div>
      <h2 className="text-small font-semibold text-white">{title}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className="rounded-control text-white/85 hover:text-white">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="pp-on-dark bg-navy text-white">
      <div className="mx-auto grid max-w-content gap-10 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <Logo inverted />
          <p className="mt-4 max-w-xs text-white/85">{TAGLINE}</p>
        </div>
        <LinkColumn title="Product" links={PUBLIC_NAV} />
        <LinkColumn title="Company" links={LEGAL_NAV} />
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto max-w-content px-4 py-6 text-small text-white/85 sm:px-6">
          © {new Date().getFullYear()} {SITE_NAME}
        </p>
      </div>
    </footer>
  );
}
