import type { CompanyVerification } from "@pitchperfect/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProvideSession } from "@/lib/session";
import { SuspendedGate } from "./SuspendedGate";
import { company, employerSession } from "./test-fixtures";

const nav = vi.hoisted(() => ({ pathname: "/employer" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

function show(pathname: string, verification: CompanyVerification) {
  nav.pathname = pathname;
  render(
    <ProvideSession session={employerSession(company({ verification }))}>
      <SuspendedGate>
        <p>Page content</p>
      </SuspendedGate>
    </ProvideSession>,
  );
}

describe("SuspendedGate", () => {
  it.each(["/employer", "/employer/jobs", "/employer/jobs/new", "/employer/jobs/abc/applicants"])(
    "shows why %s is closed to a suspended company instead of the page",
    (pathname) => {
      show(pathname, "suspended");
      expect(screen.queryByText("Page content")).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Suspended" })).toBeVisible();
      expect(screen.getByText(/can’t see applicants or their résumés/)).toBeVisible();
      expect(screen.getByRole("link", { name: "See your company profile" })).toHaveAttribute(
        "href",
        "/employer/company",
      );
      expect(screen.getByRole("link", { name: "manage your account" })).toHaveAttribute(
        "href",
        "/employer/settings",
      );
    },
  );

  it.each(["/employer/company", "/employer/settings"])(
    "keeps %s open to a suspended company",
    (pathname) => {
      show(pathname, "suspended");
      expect(screen.getByText("Page content")).toBeVisible();
    },
  );

  it.each(["verified", "unverified"] as const)("lets a %s company through", (verification) => {
    show("/employer/jobs", verification);
    expect(screen.getByText("Page content")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Suspended" })).not.toBeInTheDocument();
  });
});
