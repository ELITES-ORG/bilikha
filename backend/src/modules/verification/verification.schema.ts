import { z } from 'zod';
import type { IdType } from '../../contracts/verification.js';
import { ID_TYPE_IDS } from './id-types.js';

export const uploadUrlSchema = z.object({
  side: z.enum(['front', 'back']),
  // What the browser will PUT. resizeImage falls back to JPEG where WebP cannot
  // be encoded, and the key's extension has to match what is uploaded.
  contentType: z.enum(['image/webp', 'image/jpeg']),
});

export const submissionSchema = z.object({
  idType: z.enum(ID_TYPE_IDS as [IdType, ...IdType[]]),
  frontKey: z.string().min(1).max(512),
  backKey: z.string().min(1).max(512).optional(),
  // The ID-specific consent, separate from the privacy consent at registration.
  idConsent: z.literal(true, { message: 'Agree to how your ID is used before submitting it.' }),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;
