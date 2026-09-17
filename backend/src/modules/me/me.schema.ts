import { z } from 'zod';
import { nameField, optionalNameField, passwordField } from '../auth/auth.schema.js';

const craftOnlyFields = {
  displayName: z.string().trim().max(80).optional().or(z.literal('').transform(() => undefined)),
  bio: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
  subdomainSlugs: z.array(z.string().trim().min(1)).min(1).max(5),
  primarySubdomainSlug: z.string().trim().min(1),
  contactPreference: z.enum(['phone', 'email']),
};

const locationFields = {
  municipalitySlug: z.string().trim().min(1, 'Select a municipality'),
  barangaySlug: z.string().trim().optional().or(z.literal('').transform(() => undefined)),
};

const primaryAmongSelected = {
  path: ['primarySubdomainSlug'] as (string | number)[],
  message: 'The primary must be one of your selected sub-domains',
};

/** Creative-only fields for attaching a profile. Location already lives on the
 *  user from registration (ADR 0020). */
export const createProfileSchema = z
  .object(craftOnlyFields)
  .refine((d) => d.subdomainSlugs.includes(d.primarySubdomainSlug), primaryAmongSelected);

/** Update includes name fields and location — changing where you live later is fine. */
export const updateProfileSchema = z
  .object({
    firstName: nameField,
    middleName: optionalNameField,
    lastName: nameField,
    suffix: z.string().trim().max(12).optional().or(z.literal('').transform(() => undefined)),
    ...craftOnlyFields,
    ...locationFields,
  })
  .refine((d) => d.subdomainSlugs.includes(d.primarySubdomainSlug), primaryAmongSelected);

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    path: ['newPassword'],
    message: 'Choose a different password',
  });

export const saveOfferSchema = z.object({
  offerId: z.string().uuid('Invalid offer id'),
});

export const viewModeSchema = z.object({
  viewMode: z.enum(['hiring', 'creative']),
});

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type SaveOfferInput = z.infer<typeof saveOfferSchema>;
export type ViewModeInput = z.infer<typeof viewModeSchema>;
