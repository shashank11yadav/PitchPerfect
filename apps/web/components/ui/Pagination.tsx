import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** Link-based paging (server-rendered lists). */
  hrefFor?: (page: number) => string;
  /** Button-based paging (client lists). */
  onPageChange?: (page: number) => void;
  className?: string;
}

const ITEM =
  "inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-control px-3 text-small font-semibold";

/** Page numbers to show: the first, the last, and the current page with one neighbour each side. */
export function pageItems(page: number, totalPages: number): (number | "gap")[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  return sorted.flatMap((p, i) => {
    const previous = sorted[i - 1];
    return previous !== undefined && p - previous > 1 ? ["gap" as const, p] : [p];
  });
}

export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
  onPageChange,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const item = (target: number, content: ReactNode, label: string, current = false) => {
    const disabled = target < 1 || target > totalPages;
    const style = cn(
      ITEM,
      current ? "bg-primary text-white" : "text-ink hover:bg-primary-soft",
      disabled && "pointer-events-none opacity-50",
    );
    if (disabled) {
      return (
        <span aria-disabled="true" className={style}>
          {content}
        </span>
      );
    }
    const common = { "aria-label": label, "aria-current": current ? ("page" as const) : undefined };
    return hrefFor ? (
      <Link href={hrefFor(target)} className={style} {...common}>
        {content}
      </Link>
    ) : (
      <button type="button" onClick={() => onPageChange?.(target)} className={style} {...common}>
        {content}
      </button>
    );
  };

  return (
    <nav aria-label="Pagination" className={className}>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          {item(
            page - 1,
            <>
              <ChevronLeft aria-hidden="true" className="size-4" />
              <span>Previous</span>
            </>,
            "Previous page",
          )}
        </li>
        {pageItems(page, totalPages).map((p, i) => (
          <li key={p === "gap" ? `gap-${String(i)}` : p}>
            {p === "gap" ? (
              <span aria-hidden="true" className={cn(ITEM, "text-muted")}>
                …
              </span>
            ) : (
              item(p, p, `Page ${String(p)}`, p === page)
            )}
          </li>
        ))}
        <li>
          {item(
            page + 1,
            <>
              <span>Next</span>
              <ChevronRight aria-hidden="true" className="size-4" />
            </>,
            "Next page",
          )}
        </li>
      </ul>
    </nav>
  );
}
