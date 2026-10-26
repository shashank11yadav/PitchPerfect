"use client";

import {
  InterviewSchema,
  LIMITS,
  MEETING_SERVICE_NAMES,
  type EmployerApplicationView,
  type Interview,
} from "@pitchperfect/shared";
import { FormAlert } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Modal, ModalActions } from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api";
import { EMPLOYER_API_MESSAGES, OneApplicant } from "@/lib/employer-api";
import {
  isoToLocalInput,
  isSkippedLocalTime,
  localInputToIso,
  viewerTimeZone,
} from "@/lib/local-time";
import { useZodForm, type FormSchema } from "@/lib/use-form";
import { domainOf } from "./VerificationBanner";

const PAST = "Pick a time that hasn’t passed yet";
const SKIPPED = "That time doesn’t exist on this day";
/** Stands in for a skipped wall-clock time, so the schema fails and the message can say why. */
const SKIPPED_TIME = "skipped";

/**
 * The shared interview schema, with its errors said the way this form says them: a time that has
 * passed, or one the clocks skip.
 */
const InterviewForm: FormSchema<Interview> = {
  safeParse(data) {
    const result = InterviewSchema.safeParse(data);
    if (result.success) return result;
    const skipped =
      typeof data === "object" &&
      data !== null &&
      "startsAt" in data &&
      data.startsAt === SKIPPED_TIME;
    const issues = result.error.issues.map((issue) => {
      if (issue.path[0] !== "startsAt") return issue;
      if (skipped) return { ...issue, message: SKIPPED };
      return issue.code === "custom" ? { ...issue, message: PAST } : issue;
    });
    return { success: false, error: { issues } };
  },
};

/** The datetime-local value, read in the viewer's zone, becomes UTC; anything else is "not given". */
function toInterview(input: Record<string, unknown>) {
  const local = typeof input.startsAt === "string" ? input.startsAt : "";
  const startsAt = localInputToIso(local) ?? (isSkippedLocalTime(local) ? SKIPPED_TIME : undefined);
  return { ...input, startsAt };
}

interface InterviewDialogProps {
  open: boolean;
  onClose: () => void;
  application: EmployerApplicationView;
  /** The company's website: links on its domain are accepted besides the meeting services. */
  companyWebsite: string;
  /** The application after the api booked the slot. */
  onScheduled: (application: EmployerApplicationView) => void;
}

/** The invite limits the api enforces, said before anyone runs into them. */
const LIMITS_NOTE = `You can send up to ${String(LIMITS.interviewInvitesPerHour)} invites an hour, and up to ${String(LIMITS.interviewInvitesPerApplicationPerDay)} a day to the same applicant, new times included.`;

function InterviewFields({
  application,
  companyWebsite,
  onClose,
  onScheduled,
}: Omit<InterviewDialogProps, "open">) {
  const { interview, student } = application;
  const rescheduling = application.status === "interview";
  const zone = viewerTimeZone();
  const { register, errors, formError, submitting, handleSubmit } = useZodForm(
    InterviewForm,
    async (body) => {
      const updated = await apiFetch(
        `/employer/applications/${encodeURIComponent(application.id)}/interview`,
        {
          method: "POST",
          body,
          schema: OneApplicant,
        },
      );
      onScheduled(updated);
      onClose();
    },
    {
      initial: {
        startsAt: interview ? isoToLocalInput(interview.startsAt) : "",
        meetingUrl: interview?.meetingUrl ?? "",
      },
      required: { startsAt: "Pick a date and time", meetingUrl: "Paste the meeting link" },
      toInput: toInterview,
      apiMessages: EMPLOYER_API_MESSAGES,
    },
  );

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-5">
      <Field
        label="Date and time"
        hint={`In your time zone (${zone}). ${student.firstName} sees it in theirs.`}
        required
        error={errors.startsAt}
      >
        <Input
          {...register("startsAt")}
          type="datetime-local"
          min={isoToLocalInput(new Date().toISOString())}
        />
      </Field>
      <Field
        label="Meeting link"
        hint={`A ${MEETING_SERVICE_NAMES} link, or one on ${domainOf(companyWebsite)}, starting with https://. The email tells ${student.firstName} which site it opens.`}
        required
        error={errors.meetingUrl}
      >
        <Input {...register("meetingUrl")} type="url" inputMode="url" spellCheck={false} />
      </Field>
      <p className="text-small text-muted">{LIMITS_NOTE}</p>
      <FormAlert message={formError} />
      <ModalActions>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" loading={submitting}>
          {rescheduling ? "Send the new time" : "Send invite"}
        </Button>
      </ModalActions>
    </form>
  );
}

/**
 * Books an interview with a shortlisted applicant, or moves one already booked. The student gets
 * an email either way. Times are picked in the viewer's own zone and sent as UTC.
 */
export function InterviewDialog({
  open,
  onClose,
  application,
  companyWebsite,
  onScheduled,
}: InterviewDialogProps) {
  const { firstName } = application.student;
  const rescheduling = application.status === "interview";
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        rescheduling ? `Move ${firstName}’s interview` : `Schedule an interview with ${firstName}`
      }
      description={`${firstName} gets an email with the time and the link${rescheduling ? ", and the old time is dropped" : ""}.`}
    >
      {open && (
        <InterviewFields
          application={application}
          companyWebsite={companyWebsite}
          onClose={onClose}
          onScheduled={onScheduled}
        />
      )}
    </Modal>
  );
}
