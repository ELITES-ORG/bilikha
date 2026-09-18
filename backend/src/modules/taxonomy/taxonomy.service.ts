import { asc, eq } from 'drizzle-orm';
import type {
  Barangay,
  CreativeDomain,
  Municipality,
} from '../../contracts/taxonomy.js';
import { db } from '../../db/index.js';
import {
  barangays,
  creativeDomains,
  creativeSubdomains,
  municipalities,
} from '../../db/schema/index.js';
import { AppError } from '../../lib/http-error.js';

export type {
  Barangay,
  CreativeDomain,
  CreativeSubdomain,
  Municipality,
} from '../../contracts/taxonomy.js';

function serializeSubdomain(row: {
  id: string;
  domainId: string;
  slug: string;
  name: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    domainId: row.domainId,
    slug: row.slug,
    name: row.name,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The full domain tree. Small, static, and requested on nearly every page, so
 * it is served in one round trip rather than as nested lookups.
 */
export async function listDomains(): Promise<CreativeDomain[]> {
  const domains = await db.query.creativeDomains.findMany({
    orderBy: asc(creativeDomains.displayOrder),
    with: {
      subdomains: {
        orderBy: asc(creativeSubdomains.displayOrder),
      },
    },
  });

  return domains.map((domain) => ({
    id: domain.id,
    slug: domain.slug,
    name: domain.name,
    description: domain.description,
    displayOrder: domain.displayOrder,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
    subdomains: domain.subdomains.map(serializeSubdomain),
  }));
}

export async function getDomainBySlug(slug: string): Promise<CreativeDomain> {
  const domain = await db.query.creativeDomains.findFirst({
    where: eq(creativeDomains.slug, slug),
    with: {
      subdomains: {
        orderBy: asc(creativeSubdomains.displayOrder),
      },
    },
  });

  if (!domain) {
    throw AppError.notFound(`No creative domain with slug "${slug}"`);
  }

  return {
    id: domain.id,
    slug: domain.slug,
    name: domain.name,
    description: domain.description,
    displayOrder: domain.displayOrder,
    createdAt: domain.createdAt.toISOString(),
    updatedAt: domain.updatedAt.toISOString(),
    subdomains: domain.subdomains.map(serializeSubdomain),
  };
}

export async function listMunicipalities(): Promise<Municipality[]> {
  const rows = await db.select().from(municipalities).orderBy(asc(municipalities.name));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    psgcCode: row.psgcCode,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function listBarangays(municipalitySlug: string): Promise<Barangay[]> {
  const [municipality] = await db
    .select()
    .from(municipalities)
    .where(eq(municipalities.slug, municipalitySlug))
    .limit(1);

  if (!municipality) {
    throw AppError.notFound(`No municipality with slug "${municipalitySlug}"`);
  }

  return db
    .select({ id: barangays.id, slug: barangays.slug, name: barangays.name })
    .from(barangays)
    .where(eq(barangays.municipalityId, municipality.id))
    .orderBy(asc(barangays.name));
}
