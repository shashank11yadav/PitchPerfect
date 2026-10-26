import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import {
  bodyOf,
  csrf,
  errorResponse,
  jsonResponse,
  lastBody,
  serveApi,
  type Route,
} from "@/lib/test-api";
import { CompanyForm } from "./CompanyForm";
import { VerificationBanner } from "./VerificationBanner";
import { company } from "./test-fixtures";

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(
  patch?: Route,
  start = company({ logoUrl: "https://pitchwell-demo.example/logo.png" }),
) {
  const fetchMock = serveApi({
    "GET /api/auth/csrf": csrf,
    "GET /api/employer/company": () => jsonResponse({ company: start }),
    "PATCH /api/employer/company":
      patch ?? ((init) => jsonResponse({ company: { ...start, ...(bodyOf(init) as object) } })),
  });
  render(<CompanyForm />);
  return fetchMock;
}

describe("CompanyForm", () => {
  it("starts from the saved company and draws initials, not the remote logo", async () => {
    setup();
    expect(await screen.findByLabelText(/Company name/)).toHaveValue("Pitchwell Demo Hiring Co");
    expect(screen.getByLabelText(/Website/)).toHaveValue("https://pitchwell-demo.example");
    expect(screen.getByText("PD")).toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("saves every field and clears the optional links when they're emptied", async () => {
    const fetchMock = setup();
    const logo = await screen.findByLabelText(/Logo URL/);
    await userEvent.clear(logo);
    await userEvent.click(screen.getByRole("button", { name: "Save company" }));
    expect(await screen.findByText("Company saved.")).toBeVisible();
    expect(lastBody(fetchMock, "PATCH /api/employer/company")).toEqual({
      name: "Pitchwell Demo Hiring Co",
      website: "https://pitchwell-demo.example",
      linkedinUrl: null,
      pitch: "A made-up company for trying out PitchPerfect as an employer.",
      logoUrl: null,
    });
  });

  it("checks the links are https before sending", async () => {
    const fetchMock = setup();
    const site = await screen.findByLabelText(/Website/);
    await userEvent.clear(site);
    await userEvent.type(site, "http://pitchwell-demo.example");
    await userEvent.click(screen.getByRole("button", { name: "Save company" }));
    expect(
      await screen.findByText("Enter a full web address that starts with https://"),
    ).toBeVisible();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false);
  });

  it("shows the new verification after a website change", async () => {
    setup((init) =>
      jsonResponse({
        company: { ...company(), ...(bodyOf(init) as object), verification: "unverified" },
      }),
    );
    const site = await screen.findByLabelText(/Website/);
    await userEvent.clear(site);
    await userEvent.type(site, "https://other-name.example");
    await userEvent.click(screen.getByRole("button", { name: "Save company" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Not verified yet" })).toBeVisible();
    });
  });

  it("says so when a rename removes the badge", async () => {
    setup((init) =>
      jsonResponse({
        company: { ...company(), ...(bodyOf(init) as object), verification: "unverified" },
      }),
    );
    const name = await screen.findByLabelText(/Company name/);
    expect(name).toHaveAccessibleDescription(/removes the Verified badge/);
    await userEvent.clear(name);
    await userEvent.type(name, "Northwind Demo Hiring");
    await userEvent.click(screen.getByRole("button", { name: "Save company" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Company saved. Changing the company name removed the Verified badge until an admin approves the company again.",
    );
    expect(screen.getByRole("heading", { name: "Not verified yet" })).toBeVisible();
    // Nothing left to lose, so the warning goes.
    expect(screen.getByLabelText(/Company name/)).not.toHaveAccessibleDescription(/badge/);
  });

  it("names the domain move when that removes the badge", async () => {
    setup((init) =>
      jsonResponse({
        company: { ...company(), ...(bodyOf(init) as object), verification: "unverified" },
      }),
    );
    const site = await screen.findByLabelText(/Website/);
    await userEvent.clear(site);
    await userEvent.type(site, "https://other-name.example");
    await userEvent.click(screen.getByRole("button", { name: "Save company" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Moving the website to another domain removed the Verified badge/,
    );
  });

  it("explains a write blocked by an unconfirmed email", async () => {
    setup(() => errorResponse(403, "email_not_verified", "Verify your email to continue"));
    await userEvent.click(await screen.findByRole("button", { name: "Save company" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Confirm your email/);
  });
});

describe("VerificationBanner", () => {
  it("says how an unverified company gets verified", () => {
    render(
      <VerificationBanner verification="unverified" website="https://pitchwell-demo.example" />,
    );
    expect(screen.getByRole("heading", { name: "Not verified yet" })).toBeVisible();
    expect(screen.getByText(/@pitchwell-demo\.example/)).toBeVisible();
    expect(screen.getByText(/an admin/)).toBeVisible();
  });

  it("says suspended jobs are hidden and what else is closed", () => {
    render(
      <VerificationBanner verification="suspended" website="https://pitchwell-demo.example" />,
    );
    expect(screen.getByRole("heading", { name: "Suspended" })).toBeVisible();
    expect(screen.getByText(/hidden/)).toHaveTextContent(
      /can’t see applicants or their résumés, send interview invites, post or edit jobs/,
    );
  });

  it("shows a suspended company without the edit form", async () => {
    setup(undefined, company({ verification: "suspended" }));
    expect(await screen.findByRole("heading", { name: "Suspended" })).toBeVisible();
    expect(screen.queryByLabelText(/Company name/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save company" })).not.toBeInTheDocument();
  });

  it("says what the verified badge means", () => {
    render(<VerificationBanner verification="verified" website="https://pitchwell-demo.example" />);
    expect(screen.getByRole("heading", { name: "Verified" })).toBeVisible();
    expect(screen.getByText(/“Verified” badge with your domain/)).toBeVisible();
  });

  it("says students see a sample company as a sample, verified or not", () => {
    for (const verification of ["verified", "unverified"] as const) {
      const { unmount } = render(
        <VerificationBanner
          verification={verification}
          website="https://pitchwell-demo.example"
          sample
        />,
      );
      expect(screen.getByText(/labeled “Sample company”, with no links/)).toBeVisible();
      expect(screen.queryByText(/“Verified” badge|“Unverified employer” badge/)).toBeNull();
      unmount();
    }
  });
});
