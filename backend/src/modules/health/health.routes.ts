import { Router } from 'express';
import { sql } from '../../db/index.js';

export const healthRouter: Router = Router();

/** Liveness: the process is up. Cheap enough for a load balancer to hit often. */
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

/** Readiness: the process is up *and* can reach Postgres. */
healthRouter.get('/ready', async (_req, res) => {
  try {
    await sql`select 1`;
    res.json({ status: 'ready', database: 'connected' });
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      database: 'unreachable',
      message: (error as Error).message,
    });
  }
});
