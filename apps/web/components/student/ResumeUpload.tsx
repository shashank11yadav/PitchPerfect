"use client";

import { LIMITS, type ResumeInfo } from "@pitchperfect/shared";
import { Download } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Spinner } from "@/components/ui/Spinner";
import { apiFetch } from "@/lib/api";
import { formatLocalDate } from "@/lib/local-time";
import { useSession } from "@/lib/session";
import { ResumeUploaded } from "@/lib/student-api";
import { formMessage } from "@/lib/use-form";

const MB = 1024 * 1024;
const LIMIT_MB = LIMITS.resumeMaxBytes / MB;
const RESUME_PATH = "/me/resume";

/** The api's answers for a file it won't take, in this form's words. */
const UPLOAD_MESSAGES = {
  file_too_large: `That file is over ${String(LIMIT_MB)} MB. Save a smaller PDF and try again.`,
  unsupported_file: "Upload a PDF file.",
};

/** The same checks the api makes, so a wrong file is caught before it's sent. */
function problemWith(file: File): string | null {
  const looksLikePdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!looksLikePdf)
    return "That isn’t a PDF. Only PDF files can be uploaded; save or export your résumé as a PDF first.";
  if (file.size > LIMITS.resumeMaxBytes) {
    const size = (file.size / MB).toFixed(1);
    return `That file is ${size} MB. The limit is ${String(LIMIT_MB)} MB.`;
  }
  return null;
}

/** Upload, replace, download and delete the student's one résumé (a PDF). */
export function ResumeUpload() {
  const { profile, refresh } = useSession();
  /** What the student has done here; until then, what the session says. */
  const [onFile, setOnFile] = useState<boolean | null>(null);
  const [uploadedAt, setUploadedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [news, setNews] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const hasResume =
    onFile ?? (profile !== undefined && "hasResume" in profile && profile.hasResume);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setNews("");
    const problem = problemWith(file);
    setError(problem);
    if (problem) {
      input.value = "";
      return;
    }

    const body = new FormData();
    body.append("file", file);
    setUploading(true);
    try {
      // A 2xx means the file is stored, whatever the body says, so the answer is read separately.
      const answer = await apiFetch(RESUME_PATH, { method: "PUT", body });
      let resume: ResumeInfo | null = null;
      try {
        resume = ResumeUploaded.parse(answer);
      } catch {
        // Handled below.
      }
      if (resume) {
        setOnFile(true);
        setUploadedAt(resume.uploadedAt);
        setNews("Résumé uploaded. Employers see it when you apply to their jobs.");
      } else {
        // Stored, but not in a shape we know: go back to what the account says.
        setError(
          "We couldn’t confirm the upload. If the line above says you have a résumé on file, it worked; if not, upload it again.",
        );
        setOnFile(null);
        setUploadedAt(null);
      }
      void refresh();
    } catch (failure) {
      setError(formMessage(failure, UPLOAD_MESSAGES));
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  async function remove() {
    await apiFetch(RESUME_PATH, { method: "DELETE" });
    setOnFile(false);
    setUploadedAt(null);
    setNews("Résumé deleted.");
    void refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-ink">
        {hasResume
          ? `You have a résumé on file${uploadedAt ? `, uploaded ${formatLocalDate(uploadedAt)}` : ""}. Employers can open it from applications you send.`
          : "You have no résumé on file. Employers only see one if you upload it here."}
      </p>

      {hasResume && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <a
            href={`/api${RESUME_PATH}`}
            download
            className="pp-link inline-flex items-center gap-2 rounded-control font-semibold text-primary"
          >
            <Download aria-hidden="true" className="size-4" />
            Download your résumé
          </a>
          <Button
            variant="danger-ghost"
            size="sm"
            onClick={() => {
              setConfirming(true);
            }}
          >
            Delete résumé
          </Button>
        </div>
      )}

      <Field
        label="Upload a PDF"
        hint={`PDF only, up to ${String(LIMIT_MB)} MB.${hasResume ? " A new upload replaces the one on file." : ""}`}
        error={error}
      >
        <Input
          type="file"
          name="file"
          accept="application/pdf,.pdf"
          disabled={uploading}
          onChange={(event) => void upload(event)}
          className="h-auto py-2 file:mr-4 file:rounded-pill file:border-0 file:bg-primary-soft file:px-4 file:py-1.5 file:font-semibold file:text-primary"
        />
      </Field>
      {uploading && (
        <p className="flex items-center gap-2 text-ink">
          <Spinner />
          Uploading
        </p>
      )}
      <p role="status" className="text-ink empty:sr-only">
        {news}
      </p>

      <ConfirmDialog
        open={confirming}
        onClose={() => {
          setConfirming(false);
        }}
        title="Delete your résumé?"
        description="Employers will no longer be able to open it, including on applications you’ve already sent."
        confirmLabel="Delete it"
        cancelLabel="Keep it"
        onConfirm={remove}
      />
    </div>
  );
}
