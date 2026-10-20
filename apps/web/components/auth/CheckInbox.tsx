import { LIMITS } from "@pitchperfect/shared";
import Link from "next/link";
import { AUTH_LINK } from "./AuthCard";
import { DoneMessage } from "./form-parts";

/**
 * After sign-up. The api answers the same way for a new address and one that already has an
 * account (that one gets a warning email instead), so this says the same thing for both.
 */
export function CheckInbox({ email }: { email: string }) {
  return (
    <DoneMessage title="Check your inbox">
      <p className="text-lede text-ink">
        We sent an email to <strong className="font-semibold break-all">{email}</strong>. The link
        in it confirms your address and works for {LIMITS.verifyTokenHours} hours.
      </p>
      <p className="text-ink">
        Nothing after a few minutes? Look in your spam folder. Once you sign in, you can ask for a
        new link.
      </p>
      <p>
        <Link href="/signin" className={AUTH_LINK}>
          Go to sign in
        </Link>
      </p>
    </DoneMessage>
  );
}
