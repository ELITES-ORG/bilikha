import type { RequestHandler } from 'express';
import { AppError } from '../lib/http-error.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session.userId) {
    next(AppError.unauthorized('You must be signed in.'));
    return;
  }
  next();
};
