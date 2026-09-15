import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import type { Database } from '../index.js';
import { barangays, municipalities } from '../schema/index.js';
import { logger } from '../../lib/logger.js';

const DATA_PATH = join(dirname(fileURLToPath(import.meta.url)), 'data', 'barangays.csv');

/**
 * Expects a CSV with a header row: municipality_slug,name,psgc_code
 * Sourced from the PSA PSGC publication. Absent by design — the list is not
 * invented. When the file is missing this is a no-op and the barangay field
 * degrades to disabled in the UI.
 */
export async function seedBarangays(tx: Database): Promise<number> {
  if (!existsSync(DATA_PATH)) {
    logger.warn(
      { path: DATA_PATH },
      'barangays.csv not found — skipping. Obtain the list from the PSA PSGC publication.',
    );
    return 0;
  }

  const lines = readFileSync(DATA_PATH, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const [header, ...rows] = lines;
  if (!header?.startsWith('municipality_slug')) {
    throw new Error('barangays.csv must start with header: municipality_slug,name,psgc_code');
  }

  const townIds = new Map<string, string>();
  for (const town of await tx.select().from(municipalities)) {
    townIds.set(town.slug, town.id);
  }

  let count = 0;

  for (const row of rows) {
    const [municipalitySlug, name, psgcCode] = row.split(',').map((cell) => cell.trim());
    if (!municipalitySlug || !name) continue;

    const municipalityId = townIds.get(municipalitySlug);
    if (!municipalityId) {
      throw new Error(`Unknown municipality slug "${municipalitySlug}" in barangays.csv`);
    }

    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    await tx
      .insert(barangays)
      .values({ municipalityId, slug, name, psgcCode: psgcCode || null })
      .onConflictDoUpdate({
        target: [barangays.municipalityId, barangays.slug],
        set: { name, psgcCode: psgcCode || null },
      });

    count += 1;
  }

  return count;
}

export { eq };
