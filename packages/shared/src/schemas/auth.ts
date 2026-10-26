import { z } from "zod";
import type { Role } from "../enums.js";
import { currentPassword, emailField, httpsUrl, newPassword, tokenField } from "./common.js";
import { companyFields, type PublicCompany } from "./employer.js";
import type { PracticePartnerKind } from "./practice.js";
import {
  employerFields,
  nameFields,
  studentFields,
  type EmployerProfileView,
  type StudentProfileView,
} from "./profile.js";

const emailAndPassword = { email: emailField(), password: newPassword() };

function passwordIsNotEmail(value: { email: string; password: string }): boolean {
  return value.password.trim().toLowerCase() !== value.email;
}
const passwordIsNotEmailIssue = {
  message: "Password must not be the same as the email",
  path: ["password"],
};

export const SignupSchema = z.discriminatedUnion("role", [
  z
    .strictObject({
      role: z.literal("student"),
      ...nameFields,
      ...emailAndPassword,
      ...studentFields,
      ageConfirmed: z.literal(true),
    })
    .refine(passwordIsNotEmail, passwordIsNotEmailIssue),
  z
    .strictObject({
      role: z.literal("employer"),
      ...nameFields,
      ...emailAndPassword,
      ...employerFields,
      company: z.strictObject({
        name: companyFields.name,
        website: companyFields.website,
        linkedinUrl: httpsUrl().optional(),
      }),
    })
    .refine(passwordIsNotEmail, passwordIsNotEmailIssue),
]);
export type Signup = z.infer<typeof SignupSchema>;

export const SigninSchema = z.strictObject({
  email: emailField(),
  password: currentPassword(),
});
export type Signin = z.infer<typeof SigninSchema>;

export const ForgotPasswordSchema = z.strictObject({ email: emailField() });
export type ForgotPassword = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.strictObject({
  token: tokenField(),
  password: newPassword(),
});
export type ResetPassword = z.infer<typeof ResetPasswordSchema>;

export const VerifyEmailSchema = z.strictObject({ token: tokenField() });
export type VerifyEmail = z.infer<typeof VerifyEmailSchema>;

export const ChangeEmailSchema = z.strictObject({
  currentPassword: currentPassword(),
  newEmail: emailField(),
});
export type ChangeEmail = z.infer<typeof ChangeEmailSchema>;

export const ChangePasswordSchema = z
  .strictObject({
    currentPassword: currentPassword(),
    newPassword: newPassword(),
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: "New password must differ from the current password",
    path: ["newPassword"],
  });
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;

export const DeleteAccountSchema = z.strictObject({ currentPassword: currentPassword() });
export type DeleteAccount = z.infer<typeof DeleteAccountSchema>;

export interface PublicUser {
  id: string;
  email: string;
  role: Role;
  firstName: string;
  lastName: string;
  emailVerifiedAt: string | null;
  /** Students only; `null` for employers and for students who have not consented. */
  practiceConsentAt: string | null;
  /**
   * The kind of partner the practice notice the student accepted described. `null` without a
   * consent, and for a consent stored before the kind was kept, which is asked for again. The
   * static demo's visitor accepts the `browser` notice.
   */
  practiceConsentPartner: PracticePartnerKind | null;
  /**
   * `GET /api/auth/me` only: the address an email change is waiting to move the account to, until
   * the link sent there is followed. The same whether or not that address has an account.
   */
  pendingEmail?: string;
}

/** `GET /api/auth/me`: the signed-in user, their role profile, and (employers) their company. */
export interface AuthMe {
  user: PublicUser;
  profile: StudentProfileView | EmployerProfileView;
  company?: PublicCompany;
}
