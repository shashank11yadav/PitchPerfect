import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSignedIn, studentMe } from "@/components/student/test-fixtures";
import { bodyOf, callsTo, csrf, errorResponse, jsonResponse, serveApi } from "@/lib/test-api";
import { ConsentDialog } from "./ConsentDialog";
import { PracticeRoom } from "./PracticeRoom";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/practice/pitching",
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const QUOTA = {
  dailyUsed: 1,
  dailyLimit: 5,
  monthlyUsed: 4,
  monthlyLimit: 30,
  available: true,
  budgetExhausted: false,
  resetsAt: "2026-10-21T00:00:00.000Z",
};

const STARTED = {
  attemptId: "65f1c0ffee00000000000b01",
  scenario: {
    personaName: "Dana Ruiz",
    personaTitle: "Operations director",
    companyType: "Regional freight broker",
    personality: "Busy, skeptical",
    openingLine: "You have two minutes. What is this about?",
  },
  limits: { maxTurns: 20, maxChars: 1000, expiresAt: "2099-01-01T00:20:00.000Z" },
};

describe("ConsentDialog", () => {
  it("says the partner is an AI, where transcripts go and for how long, and what browsers do", () => {
    render(<ConsentDialog open onClose={vi.fn()} onAccepted={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Before your first practice call" });
    expect(dialog).toHaveTextContent(/an AI/);
    expect(dialog).toHaveTextContent(/180 days/);
    expect(dialog).toHaveTextContent(/Google, Apple, or Microsoft/);
    expect(dialog).toHaveTextContent(/never receives or stores audio/);
    expect(within(dialog).getByRole("link", { name: /privacy/i })).toHaveAttribute(
      "href",
      "/privacy",
    );
  });

  it("opens on its heading with focus on Not now, in the bar pinned to the dialog's bottom", () => {
    render(<ConsentDialog open partner="browser" onClose={vi.fn()} onAccepted={vi.fn()} />);
    const notNow = screen.getByRole("button", { name: "Not now" });
    expect(notNow).toHaveFocus();
    const bar = notNow.parentElement;
    expect(bar).toHaveClass("sticky");
    expect(bar).toContainElement(screen.getByRole("button", { name: "I understand" }));
  });

  it("says the partner is scripted and stays on our server when the coach runs the demo", () => {
    render(<ConsentDialog open partner="scripted" onClose={vi.fn()} onAccepted={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Before your first practice call" });
    expect(dialog).toHaveTextContent("Your practice partner is scripted.");
    expect(dialog).toHaveTextContent(
      "Your text stays with us. The scripted partner runs on our own server.",
    );
    // Said once: the heading carries the claim, the sentence after it says why.
    expect(dialog).not.toHaveTextContent(/isn’t sent to an AI provider/);
    expect(dialog).not.toHaveTextContent(/partner is an AI/);
    expect(dialog).not.toHaveTextContent(/goes to an AI provider/);
    expect(dialog).toHaveTextContent(/180 days/);
    expect(dialog).toHaveTextContent(/never receives or stores audio/);
  });

  it("says the partner and the scorer run in this tab when the demo runs in the browser", () => {
    render(<ConsentDialog open partner="browser" onClose={vi.fn()} onAccepted={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Your practice partner is scripted.");
    expect(dialog).toHaveTextContent("Everything runs in this browser tab.");
    expect(dialog).toHaveTextContent("Talking uses your browser’s speech recognition.");
    expect(dialog).not.toHaveTextContent("our own server");
    expect(dialog).not.toHaveTextContent("180 days");
  });

  it("records the acceptance and refreshes the session", async () => {
    const user = userEvent.setup();
    const onAccepted = vi.fn();
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/me/practice-consent": () =>
        jsonResponse({ practiceConsentAt: "2026-10-20T16:00:00.000Z" }),
    });
    render(<ConsentDialog open onClose={vi.fn()} onAccepted={onAccepted} />);

    await user.click(screen.getByRole("button", { name: "I understand" }));

    await waitFor(() => {
      expect(onAccepted).toHaveBeenCalled();
    });
    const post = fetchMock.mock.calls.find(([url]) => url === "/api/me/practice-consent");
    // The notice says which partner it was worded for.
    expect(bodyOf(post?.[1])).toEqual({ accepted: true, partner: "live" });
  });

  it("asks again in its own words when an earlier notice was accepted", () => {
    render(<ConsentDialog open renewal partner="live" onClose={vi.fn()} onAccepted={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Before your next practice call" });
    expect(dialog).toHaveTextContent("This notice has changed since you accepted it.");
    expect(dialog).toHaveTextContent(/Your practice partner is an AI/);
    expect(dialog).not.toHaveTextContent(/only see this once/);
  });

  it("asks for the new notice when the partner changed while this one was open", async () => {
    const user = userEvent.setup();
    const onAccepted = vi.fn();
    const onPartnerChanged = vi.fn();
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/me/practice-consent": () =>
        errorResponse(409, "conflict", "The practice partner has changed"),
    });
    render(
      <ConsentDialog
        open
        partner="scripted"
        onClose={vi.fn()}
        onAccepted={onAccepted}
        onPartnerChanged={onPartnerChanged}
      />,
    );
    await user.click(screen.getByRole("button", { name: "I understand" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your practice partner just changed, so this notice has too. Read it again.",
    );
    expect(onPartnerChanged).toHaveBeenCalledTimes(1);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and explains a failure", async () => {
    const user = userEvent.setup();
    const onAccepted = vi.fn();
    serveApi({
      "GET /api/auth/csrf": csrf,
      "POST /api/me/practice-consent": () =>
        errorResponse(500, "internal_error", "Something went wrong"),
    });
    render(<ConsentDialog open onClose={vi.fn()} onAccepted={onAccepted} />);
    await user.click(screen.getByRole("button", { name: "I understand" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Something went wrong/);
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("blocks starting a session until the notice is accepted", async () => {
    const user = userEvent.setup();
    let consented = false;
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      "GET /api/auth/me": () => {
        const me = studentMe();
        return jsonResponse({
          ...me,
          user: {
            ...me.user,
            practiceConsentAt: consented ? "2026-10-20T16:00:00.000Z" : null,
            practiceConsentPartner: consented ? "live" : null,
          },
        });
      },
      "GET /api/practice/quota": () => jsonResponse(QUOTA),
      "GET /api/practice/attempts?pageSize=1": () =>
        jsonResponse({ items: [], page: 1, pageSize: 1, total: 0 }),
      "POST /api/me/practice-consent": () => {
        consented = true;
        return jsonResponse({ practiceConsentAt: "2026-10-20T16:00:00.000Z" });
      },
      "POST /api/practice/sessions": () => jsonResponse(STARTED, 201),
    });
    renderSignedIn(<PracticeRoom skill="pitching" />);

    // The notice opens on its own the first time.
    const dialog = await screen.findByRole("dialog", { name: "Before your first practice call" });
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    await user.click(await screen.findByRole("button", { name: "Start the call" }));
    expect(screen.getByRole("dialog", { name: "Before your first practice call" })).toBeVisible();
    expect(callsTo(fetchMock, "POST /api/practice/sessions")).toBe(0);

    await user.click(screen.getByRole("button", { name: "I understand" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(callsTo(fetchMock, "POST /api/practice/sessions")).toBe(0);

    await user.click(screen.getByRole("button", { name: "Start the call" }));
    expect(await screen.findByRole("region", { name: "Dana Ruiz" })).toBeInTheDocument();
    const start = fetchMock.mock.calls.find(([url]) => url === "/api/practice/sessions");
    expect(bodyOf(start?.[1])).toEqual({ skill: "pitching" });
    expect(window.location.pathname).toBe("/app/practice/attempt/65f1c0ffee00000000000b01");
  });

  /** The lobby for a student who accepted the notice for `accepted`, while `partner` answers. */
  function lobbyAfter(accepted: string | null, partner: string) {
    let consented = accepted;
    const fetchMock = serveApi({
      "GET /api/auth/csrf": csrf,
      "GET /api/auth/me": () => {
        const me = studentMe();
        return jsonResponse({
          ...me,
          user: {
            ...me.user,
            practiceConsentAt: "2026-10-01T00:00:00.000Z",
            practiceConsentPartner: consented,
          },
        });
      },
      "GET /api/practice/quota": () => jsonResponse({ ...QUOTA, practicePartner: partner }),
      "GET /api/practice/attempts?pageSize=1": () =>
        jsonResponse({ items: [], page: 1, pageSize: 1, total: 0 }),
      "POST /api/me/practice-consent": () => {
        consented = partner;
        return jsonResponse({ practiceConsentAt: "2026-10-20T16:00:00.000Z" });
      },
      "POST /api/practice/sessions": () => jsonResponse(STARTED, 201),
    });
    renderSignedIn(<PracticeRoom skill="pitching" />);
    return fetchMock;
  }

  it("asks again, worded for a live model, once the scripted partner is replaced", async () => {
    const user = userEvent.setup();
    const fetchMock = lobbyAfter("scripted", "live");

    const dialog = await screen.findByRole("dialog", { name: "Before your next practice call" });
    expect(dialog).toHaveTextContent(/Your practice partner is an AI/);
    expect(dialog).toHaveTextContent(/goes to an AI provider/);
    await user.click(within(dialog).getByRole("button", { name: "Not now" }));
    await user.click(await screen.findByRole("button", { name: "Start the call" }));
    expect(screen.getByRole("dialog", { name: "Before your next practice call" })).toBeVisible();
    expect(callsTo(fetchMock, "POST /api/practice/sessions")).toBe(0);

    await user.click(screen.getByRole("button", { name: "I understand" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    const post = fetchMock.mock.calls.find(([url]) => url === "/api/me/practice-consent");
    expect(bodyOf(post?.[1])).toEqual({ accepted: true, partner: "live" });
  });

  it("asks again for a notice accepted before the kind was kept", async () => {
    lobbyAfter(null, "scripted");
    const dialog = await screen.findByRole("dialog", { name: "Before your next practice call" });
    await waitFor(() => {
      expect(dialog).toHaveTextContent(/scripted partner runs on our own server/);
    });
  });

  it("doesn't ask again while the same kind of partner answers", async () => {
    lobbyAfter("scripted", "scripted");
    expect(await screen.findByRole("button", { name: "Start the call" })).toBeEnabled();
    await screen.findByText(/This demo’s practice partner is scripted/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
