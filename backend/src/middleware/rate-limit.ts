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

/** Keyed on the signed-in user. Counts failures so guessing the current
 *  password is rate-limited; successes do not consume the budget. */
export const passwordChangeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => req.session.userId!,
  validate: { keyGeneratorIpFallback: false },
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many password attempts. Try again in an hour.',
    },
  },
});

/** Conversation messages — 60 per user per hour. Failures do not consume the
 *  budget so a mistyped empty body does not lock someone out. */
export const messageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipFailedRequests: true,
  keyGenerator: (req) => req.session.userId!,
  validate: { keyGeneratorIpFallback: false },
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many messages. Try again in an hour.',
    },
  },
});
