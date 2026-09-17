import { z } from 'zod';

export const agreementIdSchema = z.string().uuid('Invalid agreement id');

/** Integer centavos, never pesos and never a float (ADR 0029). */
const lineItemSchema = z.object({
  description: z.string().trim().min(1, 'Say what this service covers').max(200),
  priceCentavos: z.number().int('Prices are whole centavos').min(0).max(2_000_000_000),
});

export const issueAgreementSchema = z.object({
  packageTitle: z.string().trim().min(1, 'Give the package a title').max(120),
  notes: z.string().trim().max(2000).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-03'),
  durationDays: z.coerce.number().int().min(1, 'Duration is at least one day').max(3650),
  // Thirty is generous for a package and still caps what one request can write.
  lineItems: z.array(lineItemSchema).min(1, 'Add at least one service').max(30),
  supersedesId: agreementIdSchema.optional(),
});

export const requestRevisionSchema = z.object({
  note: z.string().trim().min(1, 'Say what needs changing').max(1000),
});

export const acceptAgreementSchema = z.object({
  password: z.string().min(1, 'Enter your password'),
  // The hash the screen rendered. Never widened to a plain string: a mismatch
  // is the whole point of the check.
  seenHash: z.string().regex(/^[0-9a-f]{64}$/, 'Reload the agreement and try again'),
});

export const agreementEventSchema = z.object({
  type: z.enum(['started', 'delivery_marked', 'completion_confirmed', 'cancelled']),
  note: z.string().trim().max(1000).optional(),
});

export const listAgreementsSchema = z.object({
  mode: z.enum(['hiring', 'creative']).default('hiring'),
});

export type IssueAgreementInput = z.infer<typeof issueAgreementSchema>;
export type RequestRevisionInput = z.infer<typeof requestRevisionSchema>;
export type AcceptAgreementInput = z.infer<typeof acceptAgreementSchema>;
export type AgreementEventInput = z.infer<typeof agreementEventSchema>;
export type ListAgreementsInput = z.infer<typeof listAgreementsSchema>;
