import { US_STATES, gradYearRange } from "@pitchperfect/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import { bodyOf, callsTo, csrf, errorResponse, jsonResponse, serveApi } from "@/lib/test-api";
import { EmployerSignupForm } from "./EmployerSignupForm";
import { StudentSignupForm } from "./StudentSignupForm";

const YEAR = gradYearRange().min + 1;

async function fillStudent() {
  await userEvent.type(screen.getByLabelText(/first name/i), "Sam");
  await userEvent.type(screen.getByLabelText(/last name/i), "Ortiz");
  await userEvent.type(screen.getByLabelText(/^email/i), "sam@example.test");
  await userEvent.type(screen.getByLabelText(/^password/i), "a long passphrase");
  await userEvent.type(screen.getByLabelText(/school/i), "Lakeside College");
  await userEvent.type(screen.getByLabelText(/major/i), "Business");
  await userEvent.selectOptions(screen.getByLabelText(/graduation year/i), String(YEAR));
  await userEvent.selectOptions(screen.getByLabelText(/state/i), "MA");
  await userEvent.type(screen.getByLabelText(/role you/i), "Sales development representative");
  await userEvent.type(screen.getByLabelText(/industry/i), "Software");
}

beforeEach(() => {
  resetCsrf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("StudentSignupForm", () => {
  it("can't be submitted without confirming the student is 18 or older", async () => {
    const fetchMock = serveApi({});
    render(<StudentSignupForm />);
    await fillStudent();
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    const age = screen.getByRole("checkbox", { name: /18 or older/i });
    expect(age).toBeRequired();
    expect(age).toHaveAttribute("aria-invalid", "true");
    expect(age).toHaveAccessibleDescription(/confirm that you're 18 or older/i);
    expect(age).toHaveFocus();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers every US state and the schema's graduation years", () => {
    serveApi({});
    render(<StudentSignupForm />);
    const states = within(screen.getByLabelText(/state/i)).getAllByRole("option");
    // A "Choose" placeholder plus every state.
    expect(states).toHaveLength(US_STATES.length + 1);
    expect(
      within(screen.getByLabelText(/state/i)).getByRole("option", { name: "Massachusetts" }),
    ).toHaveValue("MA");

    const { min, max } = gradYearRange();
    const years = within(screen.getByLabelText(/graduation year/i))
      .getAllByRole("option")
      .map((option) => option.getAttribute("value"))
      .filter(Boolean);
    expect(years[0]).toBe(String(min));
    expect(years.at(-1)).toBe(String(max));
    expect(years).toHaveLength(max - min + 1);
  });

  it("sends the shared schema's shape, then shows the same inbox message for any email", async () => {
    let sent: unknown;
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/signup": (init) => {
        sent = bodyOf(init);
        return jsonResponse({ ok: true }, 201);
      },
    });
    render(<StudentSignupForm />);
    await fillStudent();
    await userEvent.click(screen.getByRole("checkbox", { name: /18 or older/i }));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toHaveFocus();
    expect(screen.getByText("sam@example.test")).toBeInTheDocument();
    expect(sent).toEqual({
      role: "student",
      firstName: "Sam",
      lastName: "Ortiz",
      email: "sam@example.test",
      password: "a long passphrase",
      school: "Lakeside College",
      major: "Business",
      gradYear: YEAR,
      targetRole: "Sales development representative",
      industry: "Software",
      state: "MA",
      ageConfirmed: true,
    });
  });

  it("shows the server's password policy error on the password field", async () => {
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/signup": () =>
        errorResponse(400, "validation_failed", "Some fields need attention", {
          fields: { password: "This password has appeared in a data breach. Choose another." },
        }),
    });
    render(<StudentSignupForm />);
    await fillStudent();
    await userEvent.click(screen.getByRole("checkbox", { name: /18 or older/i }));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/appeared in a data breach/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("heading", { name: "Check your inbox" })).not.toBeInTheDocument();
  });
});

describe("EmployerSignupForm", () => {
  it("sends the company nested, leaves out an empty LinkedIn URL, and shows the inbox message", async () => {
    let sent: unknown;
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/auth/signup": (init) => {
        sent = bodyOf(init);
        return jsonResponse({ ok: true }, 201);
      },
    });
    render(<EmployerSignupForm />);
    await userEvent.type(screen.getByLabelText(/first name/i), "Avery");
    await userEvent.type(screen.getByLabelText(/last name/i), "Lin");
    await userEvent.type(screen.getByLabelText(/work email/i), "avery@quarrow.example.test");
    await userEvent.type(screen.getByLabelText(/job title/i), "Sales manager");
    await userEvent.type(screen.getByLabelText(/^password/i), "a long passphrase");
    await userEvent.type(screen.getByLabelText(/company name/i), "Quarrow Logistics Software");
    await userEvent.type(screen.getByLabelText(/website/i), "http://quarrow.example.test");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByLabelText(/website/i)).toHaveAccessibleDescription(/https:\/\//);
    expect(callsTo(fetchMock, "POST /api/auth/signup")).toBe(0);

    await userEvent.clear(screen.getByLabelText(/website/i));
    await userEvent.type(screen.getByLabelText(/website/i), "https://quarrow.example.test");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Check your inbox" })).toBeInTheDocument();
    expect(sent).toEqual({
      role: "employer",
      firstName: "Avery",
      lastName: "Lin",
      email: "avery@quarrow.example.test",
      password: "a long passphrase",
      jobTitle: "Sales manager",
      company: { name: "Quarrow Logistics Software", website: "https://quarrow.example.test" },
    });
  });

  it("marks LinkedIn as optional", () => {
    serveApi({});
    render(<EmployerSignupForm />);
    expect(screen.getByLabelText(/linkedin/i)).not.toBeRequired();
    expect(screen.getByLabelText(/company name/i)).toBeRequired();
  });
});
