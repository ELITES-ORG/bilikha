import { z } from 'zod';

/** Filipino names carry ñ, accents, hyphens, apostrophes and spaces — dela Cruz,
 *  Peña, D'Souza. An ASCII-only rule rejects real people. */
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M}'\-. ]*$/u;

export const nameField = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(80, 'Must be 80 characters or fewer')
  .regex(NAME_PATTERN, 'Use letters, spaces, hyphens and apostrophes only');

export const optionalNameField = z
  .string()
  .trim()
  .max(80)
  .regex(NAME_PATTERN, 'Use letters, spaces, hyphens and apostrophes only')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const usernameField = z
  .string()
  .trim()
  .min(3, 'At least 3 characters')
  .max(30, 'At most 30 characters')
  .regex(
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._]*[a-zA-Z0-9])?$/,
    'Letters, numbers, dots and underscores only; must start and end with a letter or number',
  )
  .refine((value) => !value.includes('..') && !value.includes('__'), {
    message: 'No repeated dots or underscores',
  });

/** Length beats composition rules — NIST SP 800-63B. No forced symbol classes. */
export const passwordField = z
  .string()
  .min(10, 'At least 10 characters')
  .max(128, 'At most 128 characters');

export const registerSchema = z
  .object({
    firstName: nameField,
    middleName: optionalNameField,
    lastName: nameField,
    suffix: z.string().trim().max(12).optional().or(z.literal('').transform(() => undefined)),
    username: usernameField,
    email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
    phone: z.string().trim().min(1, 'Required'),
    birthDate: z.coerce.date({ message: 'Enter a valid date' }),
    password: passwordField,
    confirmPassword: z.string(),
    privacyConsent: z.literal(true, { message: 'You must accept the privacy notice' }),
    termsAccepted: z.literal(true, { message: 'You must accept the terms' }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((data) => !data.password.toLowerCase().includes(data.username.toLowerCase()), {
    path: ['password'],
    message: 'Password must not contain your username',
  })
  .refine(
    (data) => {
      const age = (Date.now() - data.birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      return age >= 18 && age < 120;
    },
    { path: ['birthDate'], message: 'You must be at least 18 years old to register' },
  );

export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Required'),
  password: z.string().min(1, 'Required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
