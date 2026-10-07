import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  AdminTaxonomyDomain,
  AdminTaxonomySubdomain,
  TaxonomyChangeEntry,
} from '../../contracts/taxonomy.js';
import { db } from '../../db/index.js';
import {
  creativeDomains,
  creativeProfileSubdomains,
  creativeSubdomains,
  offers,
  postings,
  taxonomyChanges,
  users,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';
import type {
  CreateDomainInput,
  CreateSubdomainInput,
  TaxonomyKind,
  UpdateTaxonomyInput,
} from './taxonomy.schema.js';

/**
 * Administrator writes against the creative taxonomy (ADR 0049).
 *
 * Three rules hold throughout and are the reason this file is not a thin CRUD
 * wrapper:
 *
 * 1. **A slug is never written after creation.** No function here accepts one
 *    in an update, and `updateTaxonomySchema` rejects the field outright.
 * 2. **Archiving is the removal.** Deleting is offered only for an item
 *    nothing references, and the refusal comes from the `ON DELETE RESTRICT`
 *    constraints rather than from a check this code could drift away from.
 * 3. **Every write and its audit row land in one transaction.** A change with
 *    no history is the failure this table exists to prevent, and two
 *    statements outside a transaction is exactly how that happens.
 */

type Kind = TaxonomyKind;

interface ItemRef {
  kind: Kind;
  slug: string;
  adminId: string;
}

/** `'domains'` is the URL segment; `'domain'` is what the audit column stores. */
function auditKind(kind: Kind): 'domain' | 'subdomain' {
  return kind === 'domains' ? 'domain' : 'subdomain';
}

function serializeDomain(row: typeof creativeDomains.$inferSelect) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    displayOrder: row.displayOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSubdomain(row: typeof creativeSubdomains.$inferSelect) {
  return {
    id: row.id,
    domainId: row.domainId,
    slug: row.slug,
    name: row.name,
    displayOrder: row.displayOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * How many rows across the three referencing tables point at each sub-domain.
 *
 * One query per table rather than three joins: the counts are independent, and
 * a join across all three multiplies them.
 */
async function referenceCounts(): Promise<Map<string, number>> {
  const totals = new Map<string, number>();

  const add = (rows: { subdomainId: string | null; total: number }[]) => {
    for (const row of rows) {
      if (!row.subdomainId) continue;
      totals.set(row.subdomainId, (totals.get(row.subdomainId) ?? 0) + row.total);
    }
  };

  add(
    await db
      .select({ subdomainId: creativeProfileSubdomains.subdomainId, total: count() })
      .from(creativeProfileSubdomains)
      .groupBy(creativeProfileSubdomains.subdomainId),
  );
  add(
    await db
      .select({ subdomainId: offers.subdomainId, total: count() })
      .from(offers)
      .groupBy(offers.subdomainId),
  );
  add(
    await db
      .select({ subdomainId: postings.subdomainId, total: count() })
      .from(postings)
      .groupBy(postings.subdomainId),
  );

  return totals;
}

/**
 * The full tree including archived items, each with its reference count. The
 * admin area is the only surface that sees either — a picker showing an
 * archived sub-domain is the bug archiving exists to avoid.
 */
export async function listTaxonomyForAdmin(): Promise<AdminTaxonomyDomain[]> {
  const [domains, subdomains, totals] = await Promise.all([
    db.select().from(creativeDomains).orderBy(asc(creativeDomains.displayOrder)),
    db.select().from(creativeSubdomains).orderBy(asc(creativeSubdomains.displayOrder)),
    referenceCounts(),
  ]);

  return domains.map((domain) => {
    const children: AdminTaxonomySubdomain[] = subdomains
      .filter((sub) => sub.domainId === domain.id)
      .map((sub) => ({ ...serializeSubdomain(sub), referenceCount: totals.get(sub.id) ?? 0 }));

    return {
      ...serializeDomain(domain),
      subdomains: children,
      referenceCount: children.reduce((sum, child) => sum + child.referenceCount, 0),
    };
  });
}

/** The next free display position, so a new item lands at the end. */
async function nextDisplayOrder(domainId?: string): Promise<number> {
  if (domainId) {
    const [row] = await db
      .select({ max: sql<number | null>`max(${creativeSubdomains.displayOrder})` })
      .from(creativeSubdomains)
      .where(eq(creativeSubdomains.domainId, domainId));
    return (row?.max ?? 0) + 1;
  }

  const [row] = await db
    .select({ max: sql<number | null>`max(${creativeDomains.displayOrder})` })
    .from(creativeDomains);
  return (row?.max ?? 0) + 1;
}

async function assertSlugFree(kind: Kind, slug: string): Promise<void> {
  const rows =
    kind === 'domains'
      ? await db
          .select({ slug: creativeDomains.slug })
          .from(creativeDomains)
          .where(eq(creativeDomains.slug, slug))
      : await db
          .select({ slug: creativeSubdomains.slug })
          .from(creativeSubdomains)
          .where(eq(creativeSubdomains.slug, slug));

  if (rows.length > 0) {
    throw AppError.conflict(
      `The slug "${slug}" is already in use. A slug is permanent, so it cannot be reused — choose another.`,
    );
  }
}

export async function createDomain({
  adminId,
  input,
}: {
  adminId: string;
  input: CreateDomainInput;
}) {
  await assertSlugFree('domains', input.slug);
  const displayOrder = input.displayOrder ?? (await nextDisplayOrder());

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(creativeDomains)
      .values({
        slug: input.slug,
        name: input.name,
        description: input.description,
        displayOrder,
      })
      .returning();

    await tx.insert(taxonomyChanges).values({
      itemKind: 'domain',
      itemSlug: input.slug,
      action: 'created',
      adminId,
      after: { name: input.name, displayOrder },
    });

    return serializeDomain(row!);
  });
}

export async function createSubdomain({
  adminId,
  input,
}: {
  adminId: string;
  input: CreateSubdomainInput;
}) {
  const [domain] = await db
    .select({ id: creativeDomains.id })
    .from(creativeDomains)
    .where(eq(creativeDomains.slug, input.domainSlug));

  if (!domain) {
    throw AppError.notFound(`No creative domain with slug "${input.domainSlug}"`);
  }

  await assertSlugFree('subdomains', input.slug);
  const displayOrder = input.displayOrder ?? (await nextDisplayOrder(domain.id));

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(creativeSubdomains)
      .values({
        domainId: domain.id,
        slug: input.slug,
        name: input.name,
        displayOrder,
      })
      .returning();

    await tx.insert(taxonomyChanges).values({
      itemKind: 'subdomain',
      itemSlug: input.slug,
      action: 'created',
      adminId,
      after: { name: input.name, displayOrder, domainSlug: input.domainSlug },
    });

    return serializeSubdomain(row!);
  });
}

async function findDomain(slug: string) {
  const [row] = await db.select().from(creativeDomains).where(eq(creativeDomains.slug, slug));
  if (!row) throw AppError.notFound(`No creative domain with slug "${slug}"`);
  return row;
}

async function findSubdomain(slug: string) {
  const [row] = await db.select().from(creativeSubdomains).where(eq(creativeSubdomains.slug, slug));
  if (!row) throw AppError.notFound(`No creative sub-domain with slug "${slug}"`);
  return row;
}

/**
 * Name, description and display order. Never the slug — see
 * `updateTaxonomySchema`, which is the enforcement; this function simply has
 * nowhere to put one.
 */
export async function updateTaxonomyItem({ kind, slug, adminId, input }: ItemRef & {
  input: UpdateTaxonomyInput;
}) {
  if (kind === 'domains') {
    const current = await findDomain(slug);
    const before = {
      name: current.name,
      description: current.description,
      displayOrder: current.displayOrder,
    };
    const after = {
      name: input.name ?? current.name,
      description: input.description === undefined ? current.description : input.description,
      displayOrder: input.displayOrder ?? current.displayOrder,
    };

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(creativeDomains)
        .set({ ...after, updatedAt: new Date() })
        .where(eq(creativeDomains.id, current.id))
        .returning();

      await tx.insert(taxonomyChanges).values({
        itemKind: 'domain',
        itemSlug: slug,
        action: 'updated',
        adminId,
        before,
        after,
      });

      return serializeDomain(row!);
    });
  }

  const current = await findSubdomain(slug);
  const before = { name: current.name, displayOrder: current.displayOrder };
  const after = {
    name: input.name ?? current.name,
    displayOrder: input.displayOrder ?? current.displayOrder,
  };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(creativeSubdomains)
      .set({ ...after, updatedAt: new Date() })
      .where(eq(creativeSubdomains.id, current.id))
      .returning();

    await tx.insert(taxonomyChanges).values({
      itemKind: 'subdomain',
      itemSlug: slug,
      action: 'updated',
      adminId,
      before,
      after,
    });

    return serializeSubdomain(row!);
  });
}

/**
 * Archiving a **domain** archives its sub-domains with it, in one transaction
 * and each with its own audit row. A visible domain whose children have
 * vanished is a worse state than either end of the operation.
 */
export async function archiveTaxonomyItem({ kind, slug, adminId }: ItemRef) {
  const archivedAt = new Date();

  if (kind === 'domains') {
    const current = await findDomain(slug);

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(creativeDomains)
        .set({ archivedAt, updatedAt: archivedAt })
        .where(eq(creativeDomains.id, current.id))
        .returning();

      // Only the ones still active: re-archiving an already-archived child
      // would add a second audit row saying nothing happened.
      const toArchive = await tx
        .select({ id: creativeSubdomains.id, slug: creativeSubdomains.slug })
        .from(creativeSubdomains)
        .where(
          and(
            eq(creativeSubdomains.domainId, current.id),
            isNull(creativeSubdomains.archivedAt),
          ),
        );

      if (toArchive.length > 0) {
        await tx
          .update(creativeSubdomains)
          .set({ archivedAt, updatedAt: archivedAt })
          .where(
            inArray(
              creativeSubdomains.id,
              toArchive.map((child) => child.id),
            ),
          );

        await tx.insert(taxonomyChanges).values(
          toArchive.map((child) => ({
            itemKind: 'subdomain' as const,
            itemSlug: child.slug,
            action: 'archived' as const,
            adminId,
            after: { archivedAt: archivedAt.toISOString(), viaDomain: slug },
          })),
        );
      }

      await tx.insert(taxonomyChanges).values({
        itemKind: 'domain',
        itemSlug: slug,
        action: 'archived',
        adminId,
        after: { archivedAt: archivedAt.toISOString() },
      });

      return serializeDomain(row!);
    });
  }

  const current = await findSubdomain(slug);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(creativeSubdomains)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(eq(creativeSubdomains.id, current.id))
      .returning();

    await tx.insert(taxonomyChanges).values({
      itemKind: 'subdomain',
      itemSlug: slug,
      action: 'archived',
      adminId,
      after: { archivedAt: archivedAt.toISOString() },
    });

    return serializeSubdomain(row!);
  });
}

/**
 * Restoring a sub-domain whose domain is still archived leaves it invisible,
 * which is why the domain is restored first and the refusal says so.
 */
export async function restoreTaxonomyItem({ kind, slug, adminId }: ItemRef) {
  if (kind === 'domains') {
    const current = await findDomain(slug);

    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(creativeDomains)
        .set({ archivedAt: null, updatedAt: new Date() })
        .where(eq(creativeDomains.id, current.id))
        .returning();

      await tx.insert(taxonomyChanges).values({
        itemKind: 'domain',
        itemSlug: slug,
        action: 'restored',
        adminId,
        before: { archivedAt: current.archivedAt?.toISOString() ?? null },
      });

      return serializeDomain(row!);
    });
  }

  const current = await findSubdomain(slug);
  const [parent] = await db
    .select({ archivedAt: creativeDomains.archivedAt, slug: creativeDomains.slug })
    .from(creativeDomains)
    .where(eq(creativeDomains.id, current.domainId));

  if (parent?.archivedAt) {
    throw AppError.conflict(
      `Its domain "${parent.slug}" is archived, so restoring this sub-domain would leave it invisible. Restore the domain first.`,
    );
  }

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(creativeSubdomains)
      .set({ archivedAt: null, updatedAt: new Date() })
      .where(eq(creativeSubdomains.id, current.id))
      .returning();

    await tx.insert(taxonomyChanges).values({
      itemKind: 'subdomain',
      itemSlug: slug,
      action: 'restored',
      adminId,
      before: { archivedAt: current.archivedAt?.toISOString() ?? null },
    });

    return serializeSubdomain(row!);
  });
}

/** Postgres' foreign-key violation. */
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * Walks the `cause` chain, because Drizzle does not rethrow the driver's
 * error: it wraps it in a plain `Error` reading `Failed query: ...` and hangs
 * the `PostgresError` — the only thing carrying `code` — off `cause`. Checking
 * the top-level object alone silently never matches, which turns the 409 this
 * function exists to produce into a 500.
 */
function isForeignKeyViolation(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; current && depth < 5; depth += 1) {
    if (typeof current !== 'object') return false;
    if ((current as { code?: unknown }).code === FOREIGN_KEY_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }

  return false;
}

/**
 * Deleting is for an item nothing references — a slug typed wrongly an hour
 * ago, not a category somebody has registered under. The guard is the
 * `ON DELETE RESTRICT` constraint rather than a count read beforehand: a
 * pre-check leaves a window in which a registration can arrive, and the
 * constraint has no window.
 */
export async function deleteTaxonomyItem({ kind, slug, adminId }: ItemRef) {
  const current = kind === 'domains' ? await findDomain(slug) : await findSubdomain(slug);

  try {
    await db.transaction(async (tx) => {
      if (kind === 'domains') {
        // The sub-domains go with the domain (`ON DELETE CASCADE`), so each
        // gets its own history row, as archiving a domain does — read before
        // the delete, while they still exist.
        const children = await tx
          .select({
            slug: creativeSubdomains.slug,
            name: creativeSubdomains.name,
            displayOrder: creativeSubdomains.displayOrder,
          })
          .from(creativeSubdomains)
          .where(eq(creativeSubdomains.domainId, current.id));

        await tx.delete(creativeDomains).where(eq(creativeDomains.id, current.id));

        if (children.length > 0) {
          await tx.insert(taxonomyChanges).values(
            children.map((child) => ({
              itemKind: 'subdomain' as const,
              itemSlug: child.slug,
              action: 'deleted' as const,
              adminId,
              before: { name: child.name, displayOrder: child.displayOrder, viaDomain: slug },
            })),
          );
        }
      } else {
        await tx.delete(creativeSubdomains).where(eq(creativeSubdomains.id, current.id));
      }

      await tx.insert(taxonomyChanges).values({
        itemKind: auditKind(kind),
        itemSlug: slug,
        action: 'deleted',
        adminId,
        before: { name: current.name, displayOrder: current.displayOrder },
      });
    });
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;

    const totals = await referenceCounts();
    const referencing =
      kind === 'domains'
        ? (
            await db
              .select({ id: creativeSubdomains.id })
              .from(creativeSubdomains)
              .where(eq(creativeSubdomains.domainId, current.id))
          ).reduce((sum, sub) => sum + (totals.get(sub.id) ?? 0), 0)
        : (totals.get(current.id) ?? 0);

    throw AppError.conflict(
      `"${slug}" is used by ${referencing} profile, offer or posting ${
        referencing === 1 ? 'record' : 'records'
      }, so it cannot be deleted. Archive it instead — that takes it out of every picker and leaves those records intact.`,
    );
  }

  return { slug, deleted: true as const };
}

export async function listTaxonomyChanges({
  page,
  limit,
}: {
  page: number;
  limit: number;
}): Promise<{ rows: TaxonomyChangeEntry[]; total: number }> {
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        id: taxonomyChanges.id,
        itemKind: taxonomyChanges.itemKind,
        itemSlug: taxonomyChanges.itemSlug,
        action: taxonomyChanges.action,
        adminUsername: users.username,
        before: taxonomyChanges.before,
        after: taxonomyChanges.after,
        createdAt: taxonomyChanges.createdAt,
      })
      .from(taxonomyChanges)
      .leftJoin(users, eq(taxonomyChanges.adminId, users.id))
      .orderBy(sql`${taxonomyChanges.createdAt} desc`)
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(taxonomyChanges),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      itemKind: row.itemKind,
      itemSlug: row.itemSlug,
      action: row.action,
      adminUsername: row.adminUsername,
      before: row.before as Record<string, unknown> | null,
      after: row.after as Record<string, unknown> | null,
      createdAt: row.createdAt.toISOString(),
    })),
    total: totals?.total ?? 0,
  };
}
