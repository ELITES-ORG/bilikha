import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { uploadLimiter } from '../../middleware/rate-limit.js';
import { submissionSchema, uploadUrlSchema } from './verification.schema.js';
import { createIdUploadUrl, submitId } from './verification.service.js';

/**
 * The account's own ID submission (ADR 0057). Both routes are on the browse-only
 * gate's allowlist in `requireAuth`, because they are how an account leaves it.
 */
export const verificationRouter: Router = Router();

verificationRouter.use(requireAuth);

verificationRouter.post('/upload-url', uploadLimiter, async (req, res) => {
  const input = uploadUrlSchema.parse(req.body);
  const data = await createIdUploadUrl(req.session.userId!, input.side, input.contentType);
  res.status(200).json({ data });
});

verificationRouter.post('/submission', async (req, res) => {
  const input = submissionSchema.parse(req.body);
  const data = await submitId(req.session.userId!, input);
  res.status(200).json({ data });
});
