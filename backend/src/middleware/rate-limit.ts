import rateLimit from 'express-rate-limit';

/** Without phone verification there is no cost ceiling on account creation
 *  (ADR 0013), so these limits are the only brake. */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Count only registrations that actually created an account. Counting 4xx
  // responses too would lock a legitimate user out for an hour after five
  // mistyped form submissions — and they would get no explanation for it.
  // Abuse still costs an attacker one slot per successful account, which is
  // what the limit exists to cap.
  skipFailedRequests: true,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many registration attempts. Try again in an hour.',
    },
  },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many sign-in attempts. Try again in 15 minutes.',
    },
  },
});
