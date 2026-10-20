import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetCsrf } from "@/lib/api";
import {
  bodyOf,
  callsTo,
  csrf,
  errorResponse,
  jsonResponse,
  serveApi,
  signedOut,
  type Route,
} from "@/lib/test-api";
import { AccountDanger } from "./AccountDanger";
import { renderSignedIn, studentMe } from "./test-fixtures";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const resetSpy = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    resetCsrf: () => {
      resetSpy();
      actual.resetCsrf();
    },
  };
});

function setup(remove: Route) {
  let deleted = false;
  const fetchMock = serveApi({
    "GET /api/auth/me": (init) => (deleted ? signedOut(init) : jsonResponse(studentMe())),
    "GET /api/auth/csrf": csrf,
    "POST /api/auth/signout": () => new Response(null, { status: 204 }),
    "DELETE /api/me": async (init) => {
      const res = await remove(init);
      deleted = res.status === 204;
      return res;
    },
  });
  renderSignedIn(<AccountDanger />);
  return fetchMock;
}

beforeEach(() => {
  resetCsrf();
  resetSpy.mockClear();
  router.push.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AccountDanger", () => {
  it("keeps the button disabled until DELETE is typed and the password entered", async () => {
    setup(() => new Response(null, { status: 204 }));
    const button = await screen.findByRole("button", { name: "Delete my account" });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/type delete/i), "delete");
    await userEvent.type(screen.getByLabelText(/current password/i), "a long passphrase");
    expect(button).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/type delete/i));
    await userEvent.type(screen.getByLabelText(/type delete/i), "DELETE");
    expect(button).toBeEnabled();

    await userEvent.clear(screen.getByLabelText(/current password/i));
    expect(button).toBeDisabled();
  });

  it("sends the password, forgets the session and goes home", async () => {
    let sent: unknown;
    const fetchMock = setup((init) => {
      sent = bodyOf(init);
      return new Response(null, { status: 204 });
    });
    await userEvent.type(await screen.findByLabelText(/type delete/i), "DELETE");
    await userEvent.type(screen.getByLabelText(/current password/i), "a long passphrase");
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    await waitFor(() => {
      expect(router.push).toHaveBeenCalledWith("/");
    });
    expect(sent).toEqual({ currentPassword: "a long passphrase" });
    expect(resetSpy).toHaveBeenCalled();
    expect(callsTo(fetchMock, "GET /api/auth/me")).toBe(2);
  });

  it("says so when the password is wrong, and keeps the account", async () => {
    setup(() => errorResponse(401, "invalid_credentials", "Email or password is incorrect"));
    await userEvent.type(await screen.findByLabelText(/type delete/i), "DELETE");
    await userEvent.type(screen.getByLabelText(/current password/i), "not my password");
    await userEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/password isn.t right/i);
    expect(router.push).not.toHaveBeenCalled();
  });
});
