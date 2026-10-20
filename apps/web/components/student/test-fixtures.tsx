import type { StudentApplicationView } from "@pitchperfect/shared";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { SessionProvider } from "@/lib/session";
import { meBody } from "@/lib/test-api";

/** A fictional signed-in student, as `GET /api/auth/me` returns them. */
export function studentMe({ verified = true, hasResume = false } = {}) {
  const me = meBody("student", { verified });
  return {
    ...me,
    profile: {
      school: "Lakeside College",
      major: "Business",
      gradYear: 2027,
      targetRole: "Sales development representative",
      industry: "Software",
      state: "MA",
      hasResume,
      lessonsCompleted: [],
    },
  };
}

/** Renders `ui` inside a session that asks `/auth/me` (stub it with `serveApi`). */
export const renderSignedIn = (ui: ReactElement) =>
  render(<SessionProvider initialStatus="loading">{ui}</SessionProvider>);

export function application(
  overrides: Partial<StudentApplicationView> = {},
): StudentApplicationView {
  return {
    id: "65f1c0ffee00000000000a01",
    status: "applied",
    closedReason: null,
    appliedAt: "2026-10-14T15:00:00.000Z",
    updatedAt: "2026-10-14T15:00:00.000Z",
    job: {
      id: "65f1c0ffee0000000000abcd",
      slug: "sales-development-representative-a1b2c3",
      title: "Sales development representative",
      companyName: "Quarrow Logistics Software",
    },
    interview: null,
    hasSharedScorecard: false,
    sharedAttemptId: null,
    ...overrides,
  };
}

export const pageOf = <T,>(items: T[], total = items.length, pageSize = 20) => ({
  items,
  page: 1,
  pageSize,
  total,
});
