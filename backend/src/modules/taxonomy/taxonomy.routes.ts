import { Router } from 'express';
import {
  getDomainBySlug,
  listBarangays,
  listDomains,
  listMunicipalities,
} from './taxonomy.service.js';

export const taxonomyRouter: Router = Router();

taxonomyRouter.get('/domains', async (_req, res) => {
  res.json({ data: await listDomains() });
});

taxonomyRouter.get('/domains/:slug', async (req, res) => {
  res.json({ data: await getDomainBySlug(req.params.slug!) });
});

taxonomyRouter.get('/municipalities', async (_req, res) => {
  res.json({ data: await listMunicipalities() });
});

taxonomyRouter.get('/municipalities/:slug/barangays', async (req, res) => {
  res.json({ data: await listBarangays(req.params.slug!) });
});
