import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Column<Row> {
  key: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  className?: string;
}

interface DataTableProps<Row> {
  /** Names the table; visually hidden unless `showCaption`. */
  caption: string;
  showCaption?: boolean;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Shown in a single row when there are no rows. */
  empty?: ReactNode;
  className?: string;
}

/** A semantic table in a keyboard-scrollable region, so wide tables work on phones. */
export function DataTable<Row>({
  caption,
  showCaption = false,
  columns,
  rows,
  rowKey,
  empty = "Nothing here yet.",
  className,
}: DataTableProps<Row>) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className={cn("overflow-x-auto rounded-card border border-border bg-surface", className)}
    >
      <table className="w-full border-collapse text-left text-small">
        <caption className={showCaption ? "px-4 pt-4 text-left font-semibold text-ink" : "sr-only"}>
          {caption}
        </caption>
        <thead className="bg-surface-2 text-ink">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn("px-4 py-3 font-semibold", column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-border">
                {columns.map((column) => (
                  <td key={column.key} className={cn("px-4 py-3 align-top", column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
