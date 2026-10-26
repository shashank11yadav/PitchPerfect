import { canTransition, type ApplicationActor, type ApplicationStatus } from "@pitchperfect/shared";
import { ValidationError } from "../../errors.js";

/**
 * Moves `application` to `to` if `actor` is allowed to make that change from its current status
 * (the table lives in `@pitchperfect/shared`). Otherwise throws `400 invalid_transition` and
 * leaves the application as it was. Only sets `status`; the caller persists it.
 */
export function transitionApplication(
  application: { status: ApplicationStatus },
  to: ApplicationStatus,
  actor: ApplicationActor,
): void {
  if (!canTransition(application.status, to, actor)) {
    throw new ValidationError(
      undefined,
      `An application that is ${application.status} can’t be changed to ${to}`,
      "invalid_transition",
    );
  }
  application.status = to;
}
