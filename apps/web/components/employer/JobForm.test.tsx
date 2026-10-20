import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { JobForm } from "./JobForm";
import { employerJob } from "./test-fixtures";

function setup(initial = employerJob()) {
  const onSubmit = vi.fn(() => Promise.resolve());
  render(<JobForm initial={initial} onSubmit={onSubmit} />);
  return { onSubmit };
}

async function retype(label: RegExp | string, value: string) {
  const input = screen.getByLabelText(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
}

describe("JobForm", () => {
  it("blocks publishing when the range minimum is above the maximum", async () => {
    const { onSubmit } = setup();
    await screen.findByRole("textbox", { name: /Job description/ });
    await retype(/Lowest/, "70000");
    await retype(/Highest/, "60000");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Minimum pay must not exceed maximum pay")).toBeVisible();
    expect(screen.getByLabelText(/Highest/)).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("publishes the parsed job, with numbers for pay and a list of skills", async () => {
    const { onSubmit } = setup();
    await screen.findByRole("textbox", { name: /Job description/ });
    await retype(/Lowest/, "52,000");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        {
          title: "Sales development representative",
          location: "Remote, US",
          workplace: "remote",
          employmentType: "full_time",
          descriptionHtml: employerJob().descriptionHtml,
          skills: ["Cold outreach", "Follow-up"],
          pay: {
            type: "range",
            min: 52_000,
            max: 58_000,
            currency: "USD",
            frequency: "annually",
            commission: true,
          },
        },
        "publish",
      );
    });
  });

  it("saves a draft with the same fields", async () => {
    const { onSubmit } = setup();
    await screen.findByRole("textbox", { name: /Job description/ });
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ title: employerJob().title }),
        "save",
      );
    });
  });

  it("sends only what the chosen pay type needs", async () => {
    const { onSubmit } = setup();
    await screen.findByRole("textbox", { name: /Job description/ });
    await userEvent.click(screen.getByRole("radio", { name: "Exact amount" }));
    expect(screen.queryByLabelText(/Lowest/)).not.toBeInTheDocument();
    await retype(/^Amount/, "22.50");
    await userEvent.selectOptions(screen.getByLabelText(/How often/), "hourly");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          pay: {
            type: "exact",
            amount: 22.5,
            currency: "USD",
            frequency: "hourly",
            commission: true,
          },
        }),
        "save",
      );
    });

    await userEvent.click(screen.getByRole("radio", { name: "Unpaid" }));
    expect(screen.queryByLabelText(/Currency/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenLastCalledWith(
        expect.objectContaining({ pay: { type: "unpaid" } }),
        "save",
      );
    });
  });

  it("asks for pay amounts that are left empty", async () => {
    const { onSubmit } = setup();
    await screen.findByRole("textbox", { name: /Job description/ });
    await retype(/Lowest/, "");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Enter the lowest pay")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("asks for a number when the pay isn't one", async () => {
    const { onSubmit } = setup();
    await screen.findByRole("textbox", { name: /Job description/ });
    await retype(/Lowest/, "lots");
    await userEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Enter a number above 0")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("adds skills as chips, skips repeats, and stops at 15", async () => {
    setup(employerJob({ skills: [] }));
    const input = await screen.findByLabelText(/^Skills/);
    await userEvent.type(input, "Cold calling{Enter}");
    await userEvent.type(input, "cold calling{Enter}");
    const list = screen.getByRole("list", { name: "Skills added" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remove Cold calling" })).toBeVisible();
    for (let n = 2; n <= 15; n += 1) await userEvent.type(input, `Skill ${String(n)}{Enter}`);
    expect(within(list).getAllByRole("listitem")).toHaveLength(15);
    expect(input).toBeDisabled();
    expect(screen.getByText(/15 of 15/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Remove Skill 2" }));
    expect(input).toBeEnabled();
  });

  it("caps each skill at 40 characters", async () => {
    setup(employerJob({ skills: [] }));
    expect(await screen.findByLabelText(/^Skills/)).toHaveAttribute("maxLength", "40");
  });

  it("starts empty for a new job and asks for a description", async () => {
    const onSubmit = vi.fn(() => Promise.resolve());
    render(<JobForm onSubmit={onSubmit} />);
    await screen.findByRole("textbox", { name: /Job description/ });
    await userEvent.type(screen.getByLabelText(/^Job title/), "Account executive");
    await userEvent.type(screen.getByLabelText(/^Location/), "Boston, MA");
    await userEvent.type(screen.getByLabelText(/Lowest/), "50000");
    await userEvent.type(screen.getByLabelText(/Highest/), "60000");
    await userEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Add a job description")).toBeVisible();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("saves changes to a live job without a publish button", async () => {
    const { onSubmit } = setup(employerJob({ status: "active" }));
    await screen.findByRole("textbox", { name: /Job description/ });
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.anything(), "save");
    });
  });
});
