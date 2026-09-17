import { Router } from 'express';
import { healthRouter } from '../modules/health/health.routes.js';
import { taxonomyRouter } from '../modules/taxonomy/taxonomy.routes.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { adminRouter } from '../modules/admin/admin.routes.js';
import { agreementsRouter } from '../modules/agreements/agreements.routes.js';
import { profilesRouter } from '../modules/profiles/profiles.routes.js';
import { conversationsRouter } from '../modules/conversations/conversations.routes.js';
import { meRouter } from '../modules/me/me.routes.js';
import { mediaRouter } from '../modules/media/media.routes.js';
import { offersRouter } from '../modules/offers/offers.routes.js';
import { postingsRouter } from '../modules/postings/postings.routes.js';
import { ratingsRouter } from '../modules/ratings/ratings.routes.js';
import { notificationsRouter } from '../modules/notifications/notifications.routes.js';

/**
 * All application routes hang off /api/v1. Versioning the prefix from day one
 * costs nothing now and avoids a painful migration once the mobile wrapper is
 * shipping against a released contract.
 */
export const apiRouter: Router = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/agreements', agreementsRouter);
apiRouter.use('/creatives', profilesRouter);
apiRouter.use('/conversations', conversationsRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/media', mediaRouter);
apiRouter.use('/offers', offersRouter);
apiRouter.use('/postings', postingsRouter);
apiRouter.use('/ratings', ratingsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/taxonomy', taxonomyRouter);
