import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { taxonomyRouter } from '../modules/taxonomy/taxonomy.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';

/**
 * All application routes hang off /api/v1. Versioning the prefix from day one
 * costs nothing now and avoids a painful migration once the mobile wrapper is
 * shipping against a released contract.
 */
export const apiRouter: Router = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/taxonomy', taxonomyRouter);
