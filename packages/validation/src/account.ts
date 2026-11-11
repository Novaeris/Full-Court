import { z } from "zod";

/**
 * Account rules shared by every client and the server. The database enforces
 * the same limits (supabase/migrations/*_profiles.sql); keep them in step.
 */
export const DISPLAY_NAME_MAX = 40;
export const PASSWORD_MIN = 10;
/** bcrypt, which Supabase Auth uses, only reads the first 72 bytes. */
export const PASSWORD_MAX = 72;

export const EmailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "That email address is too long.")
  .email("Enter a valid email address.");

export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters.`);

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1, "Enter a display name.")
  .max(DISPLAY_NAME_MAX, `Use at most ${DISPLAY_NAME_MAX} characters.`);

export const SignUpRequestSchema = z.object({
  displayName: DisplayNameSchema,
  email: EmailSchema,
  password: PasswordSchema,
  /** The Terms, Privacy Policy and Alpha Disclaimer checkbox. */
  acceptTerms: z.literal(true, {
    message:
      "Agree to the Terms and confirm you've read the Alpha Disclaimer and Privacy Policy to continue.",
  }),
});
export type SignUpRequest = z.infer<typeof SignUpRequestSchema>;

export const SignInRequestSchema = z.object({
  email: EmailSchema,
  // Don't apply the length rules on sign-in: just require something.
  password: z.string().min(1, "Enter your password."),
});
export type SignInRequest = z.infer<typeof SignInRequestSchema>;

export const PasswordResetRequestSchema = z.object({ email: EmailSchema });

export const NewPasswordRequestSchema = z.object({ password: PasswordSchema });

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: PasswordSchema,
});

export const ChangeEmailRequestSchema = z.object({
  newEmail: EmailSchema,
  currentPassword: z.string().min(1, "Enter your current password."),
});

/** GET /api/v1/me */
export const ProfileSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

/** PATCH /api/v1/me */
export const UpdateProfileRequestSchema = z.object({
  displayName: DisplayNameSchema,
});
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;

/** DELETE /api/v1/me: the password is re-checked before anything is deleted. */
export const DeleteAccountRequestSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm."),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequestSchema>;

export const DeleteAccountResponseSchema = z.object({
  deleted: z.literal(true),
});
