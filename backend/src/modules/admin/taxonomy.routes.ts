import { Router } from 'express';
import type { ListMeta } from '../../contracts/pagination.js';
import { topMisses } from '../search/search-misses.js';
import {
  addAliasSchema,
  aliasParamsSchema,
  createDomainSchema,
  createSubdomainSchema,
  searchMissesQuerySchema,
  subdomainAliasParamsSchema,
  taxonomyChangesQuerySchema,
  taxonomyParamsSchema,
  updateTaxonomySchema,
} from './taxonomy.schema.js';
import {
  addAlias,
  archiveTaxonomyItem,
  createDomain,
  createSubdomain,
  deleteTaxonomyItem,
  listTaxonomyChanges,
  listTaxonomyForAdmin,
  removeAlias,
  restoreTaxonomyItem,
  updateTaxonomyItem,
} from './taxonomy.service.js';

/**
 * Mounted inside `adminRouter`, which calls `requireAdmin` for everything
 * under it — so every route here is admin-only by construction rather than by
 * remembering a guard per route (ADR 0035, and the `AdminAccountsPage` near
 * miss it records).
 *
 * No logic lives here: parse, call, respond.
 */
export const taxonomyAdminRouter: Router = Router();

taxonomyAdminRouter.get('/taxonomy', async (_req, res) => {
  res.json({ data: await listTaxonomyForAdmin() });
});

taxonomyAdminRouter.get('/taxonomy/changes', async (req, res) => {
  const query = taxonomyChangesQuerySchema.parse(req.query);
  const { rows, total } = await listTaxonomyChanges(query);
  const meta: ListMeta = { page: query.page, limit: query.limit, total };
  res.json({ data: rows, meta });
});

// Everyday words (issue #24). Declared before the `:kind/:slug` routes below,
// which would otherwise read "subdomains/<slug>/aliases" as something else.
taxonomyAdminRouter.post('/taxonomy/subdomains/:slug/aliases', async (req, res) => {
  const { slug } = subdomainAliasParamsSchema.parse(req.params);
  const { term } = addAliasSchema.parse(req.body);
  const data = await addAlias({ slug, adminId: req.session.userId!, term });
  res.status(201).json({ data });
});

taxonomyAdminRouter.delete('/taxonomy/subdomains/:slug/aliases/:id', async (req, res) => {
  const { slug, id } = aliasParamsSchema.parse(req.params);
  res.json({ data: await removeAlias({ slug, id, adminId: req.session.userId! }) });
});

/** The most common searches that found nothing — where aliases are missing. */
taxonomyAdminRouter.get('/search-misses', async (req, res) => {
  const { days } = searchMissesQuerySchema.parse(req.query);
  res.json({ data: await topMisses(days) });
});

taxonomyAdminRouter.post('/taxonomy/domains', async (req, res) => {
  const input = createDomainSchema.parse(req.body);
  const data = await createDomain({ adminId: req.session.userId!, input });
  res.status(201).json({ data });
});

taxonomyAdminRouter.post('/taxonomy/subdomains', async (req, res) => {
  const input = createSubdomainSchema.parse(req.body);
  const data = await createSubdomain({ adminId: req.session.userId!, input });
  res.status(201).json({ data });
});

taxonomyAdminRouter.patch('/taxonomy/:kind/:slug', async (req, res) => {
  const { kind, slug } = taxonomyParamsSchema.parse(req.params);
  const input = updateTaxonomySchema.parse(req.body);
  const data = await updateTaxonomyItem({ kind, slug, adminId: req.session.userId!, input });
  res.json({ data });
});

taxonomyAdminRouter.post('/taxonomy/:kind/:slug/archive', async (req, res) => {
  const { kind, slug } = taxonomyParamsSchema.parse(req.params);
  const data = await archiveTaxonomyItem({ kind, slug, adminId: req.session.userId! });
  res.json({ data });
});

taxonomyAdminRouter.post('/taxonomy/:kind/:slug/restore', async (req, res) => {
  const { kind, slug } = taxonomyParamsSchema.parse(req.params);
  const data = await restoreTaxonomyItem({ kind, slug, adminId: req.session.userId! });
  res.json({ data });
});

taxonomyAdminRouter.delete('/taxonomy/:kind/:slug', async (req, res) => {
  const { kind, slug } = taxonomyParamsSchema.parse(req.params);
  const data = await deleteTaxonomyItem({ kind, slug, adminId: req.session.userId! });
  res.json({ data });
});
