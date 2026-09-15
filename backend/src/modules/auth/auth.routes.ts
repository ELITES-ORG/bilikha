import { Router } from 'express';
import { AppError } from '../../lib/http-error.js';
import { requireAuth } from '../../middleware/require-auth.js';
import { loginLimiter, registerLimiter } from '../../middleware/rate-limit.js';
import { loginSchema, registerSchema } from './auth.schema.js';
import { authenticate, getUserById, registerUser } from './auth.service.js';

export const authRouter: Router = Router();

authRouter.post('/register', registerLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await registerUser(input);

  // Log the new user straight in. Regenerate first so the pre-login session id
  // cannot be reused — session fixation.
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = user.id;
  res.status(201).json({ data: user });
});

authRouter.post('/login', loginLimiter, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const user = await authenticate(input.username, input.password);

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = user.id;
  res.json({ data: user });
});

authRouter.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('bilikha.sid', { path: '/' });
    res.status(204).send();
  });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await getUserById(req.session.userId!);
  if (!user) {
    // Session points at a deleted user. Clear it rather than 500.
    req.session.destroy(() => undefined);
    throw AppError.unauthorized('Session is no longer valid.');
  }
  res.json({ data: user });
});
