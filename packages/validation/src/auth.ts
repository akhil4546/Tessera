import { z } from 'zod';
import { MIN_SIGNUP_AGE, ageOn, parseIsoDateOnly } from './age';
import { handleSchema } from './handle';

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Password is too long')
  .refine((value) => /[A-Za-z]/.test(value) && /[0-9]/.test(value), {
    message: 'Use letters and numbers',
  });

export const emailSchema = z
  .string()
  .trim()
  .email('Enter a valid email')
  .max(254)
  .transform((value) => value.toLowerCase());

export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .superRefine((value, ctx) => {
    try {
      const dob = parseIsoDateOnly(value);
      const age = ageOn(dob);
      if (age < MIN_SIGNUP_AGE) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `You must be at least ${MIN_SIGNUP_AGE}`,
        });
      }
      if (age > 120) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid date of birth' });
      }
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid date of birth' });
    }
  });

export const clientKindSchema = z.enum(['web', 'mobile']);

export const displayNameSchema = z.string().trim().min(1, 'Enter a name').max(50);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  handle: handleSchema,
  displayName: displayNameSchema,
  dateOfBirth: dateOfBirthSchema,
  client: clientKindSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
  client: clientKindSchema.optional(),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(16).max(256),
});

export const resendVerificationSchema = z.object({
  email: emailSchema.optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(16).max(256),
  password: passwordSchema,
});

export const totpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Enter the 6-digit code');

export const recoveryCodeSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/i, 'Enter a recovery code');

export const twoFactorVerifySchema = z.object({
  challengeToken: z.string().min(16),
  code: totpCodeSchema.optional(),
  recoveryCode: recoveryCodeSchema.optional(),
  client: clientKindSchema.optional(),
});

export const totpConfirmSchema = z.object({
  code: totpCodeSchema,
});

export const totpDisableSchema = z.object({
  password: z.string().min(1).max(128),
  code: totpCodeSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(16).max(512).optional(),
  client: clientKindSchema.optional(),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(16).max(512).optional(),
  client: clientKindSchema.optional(),
});

export const oauthCompleteSchema = z.object({
  setupToken: z.string().min(16),
  handle: handleSchema,
  displayName: displayNameSchema,
  dateOfBirth: dateOfBirthSchema,
  client: clientKindSchema.optional(),
});

export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;
