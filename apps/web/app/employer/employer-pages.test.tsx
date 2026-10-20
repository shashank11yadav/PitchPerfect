import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { serveApi } from "@/lib/test-api";
import EditJobPage from "./jobs/[id]/page";
import ApplicantsPage from "./jobs/[id]/applicants/page";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

afterEach(() => {
  vi.unstubAllGlobals();
});

const TAMPERED = [
  "../../me",
  "65f1c0ffee0000000000abc",
  "65f1c0ffee0000000000abcd?x=1",
  "%2e%2e",
  "zzzzzzzzzzzzzzzzzzzzzzzz",
];
const props = (id: string) => ({
  params: Promise.resolve({ id }),
  searchParams: Promise.resolve({}),
});

describe("employer job pages", () => {
  it.each(TAMPERED)(
    "show the not-found state for the job id %j without asking the api",
    async (id) => {
      const fetchMock = serveApi({});
      render(await EditJobPage(props(id)));
      expect(screen.getByRole("heading", { name: "This job isn’t here" })).toBeVisible();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(TAMPERED)(
    "show the not-found state for applicants of %j without asking the api",
    async (id) => {
      const fetchMock = serveApi({});
      render(await ApplicantsPage(props(id)));
      expect(screen.getByRole("heading", { name: "This job isn’t here" })).toBeVisible();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
});
