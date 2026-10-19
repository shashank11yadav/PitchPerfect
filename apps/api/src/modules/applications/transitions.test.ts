import { describe, expect, it } from "vitest";
import type { ApplicationStatus } from "@pitchperfect/shared";
import { ValidationError } from "../../errors.js";
import { transitionApplication } from "./transitions.js";

describe("transitionApplication", () => {
  it("sets the new status when the actor may make the change", () => {
    const application = { status: "applied" as ApplicationStatus };
    transitionApplication(application, "shortlisted", "employer");
    expect(application.status).toBe("shortlisted");
    transitionApplication(application, "withdrawn", "student");
    expect(application.status).toBe("withdrawn");
  });

  it("lets the system close any open application", () => {
    const application = { status: "interview" as ApplicationStatus };
    transitionApplication(application, "closed", "system");
    expect(application.status).toBe("closed");
  });

  it("throws invalid_transition and leaves the status alone otherwise", () => {
    const application = { status: "hired" as ApplicationStatus };
    expect(() => {
      transitionApplication(application, "withdrawn", "student");
    }).toThrow(expect.objectContaining({ code: "invalid_transition", status: 400 }));
    expect(() => {
      transitionApplication({ status: "applied" }, "hired", "employer");
    }).toThrow(ValidationError);
    expect(application.status).toBe("hired");
  });
});
