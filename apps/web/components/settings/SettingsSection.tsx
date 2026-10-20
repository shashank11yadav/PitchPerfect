import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

interface SettingsSectionProps {
  id: string;
  title: string;
  description?: ReactNode;
  /** The account deletion card: a red edge so it's never mistaken for an ordinary form. */
  danger?: boolean;
  children: ReactNode;
}

/** One card on a settings page, reachable by its `id` from the page's section links. */
export function SettingsSection({
  id,
  title,
  description,
  danger = false,
  children,
}: SettingsSectionProps) {
  return (
    <Card
      as="section"
      id={id}
      aria-labelledby={`${id}-heading`}
      className={cn("scroll-mt-24 md:p-8", danger && "border-danger/40")}
    >
      <h2 id={`${id}-heading`} className={cn("text-h4", danger && "text-danger")}>
        {title}
      </h2>
      {description && <p className="mt-1 max-w-prose text-muted">{description}</p>}
      <div className="mt-6">{children}</div>
    </Card>
  );
}

/** In-page links to a settings page's sections, beside them on wide screens. */
export function SettingsNav({ sections }: { sections: readonly { id: string; title: string }[] }) {
  return (
    <nav aria-label="Settings sections" className="hidden lg:block">
      <ul className="sticky top-24 flex flex-col gap-1">
        {sections.map(({ id, title }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="block rounded-control px-3 py-2 font-semibold text-ink hover:bg-primary-soft hover:text-primary"
            >
              {title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
