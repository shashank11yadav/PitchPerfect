import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTable, type Column } from "./DataTable";

interface Applicant {
  id: string;
  name: string;
  status: string;
}

const COLUMNS: Column<Applicant>[] = [
  { key: "name", header: "Name", cell: (row) => row.name },
  { key: "status", header: "Status", cell: (row) => row.status },
];

describe("DataTable", () => {
  it("renders a captioned table with column headers in a focusable region", () => {
    render(
      <DataTable
        caption="Applicants"
        columns={COLUMNS}
        rows={[{ id: "1", name: "Avery Example", status: "Applied" }]}
        rowKey={(row) => row.id}
      />,
    );
    const table = screen.getByRole("table", { name: "Applicants" });
    expect(screen.getByRole("region", { name: "Applicants" })).toHaveAttribute("tabindex", "0");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(["Name", "Status"]);
    expect(within(table).getByRole("cell", { name: "Avery Example" })).toBeInTheDocument();
  });

  it("shows the empty message across all columns", () => {
    render(
      <DataTable
        caption="Applicants"
        columns={COLUMNS}
        rows={[]}
        rowKey={(row) => row.id}
        empty="No applicants yet."
      />,
    );
    expect(screen.getByRole("cell", { name: "No applicants yet." })).toHaveAttribute(
      "colspan",
      "2",
    );
  });
});
