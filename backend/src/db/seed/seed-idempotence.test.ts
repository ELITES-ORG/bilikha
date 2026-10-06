import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../index.js';
import { creativeDomains, creativeSubdomains } from '../schema/index.js';

const run = promisify(execFile);

/**
 * The seed is what Render's build command runs on every backend deploy, so
 * these two properties are the difference between an administrator's edit
 * lasting and being silently reverted (ADR 0047).
 *
 * The real script is spawned rather than a extracted copy of its logic: the
 * thing worth testing is the command production runs, including its top-level
 * runner.
 *
 * Reference tables are never truncated between tests (`src/test/setup.ts`), so
 * anything these cases change they change for the whole run. Each one restores
 * what it touched.
 */
async function reseed(): Promise<void> {
  await run('npm', ['run', 'db:seed'], {
    cwd: process.cwd(),
    env: process.env,
  });
}

const SUBJECT = 'filmmakers';
let originalName: string | null = null;

afterEach(async () => {
  if (originalName === null) return;
  await db
    .update(creativeSubdomains)
    .set({ name: originalName })
    .where(eq(creativeSubdomains.slug, SUBJECT));
  originalName = null;
});

describe('reference-data seed', () => {
  it('leaves the counts alone when every slug is already present', async () => {
    await reseed();

    const domains = await db.select({ slug: creativeDomains.slug }).from(creativeDomains);
    const subdomains = await db.select({ slug: creativeSubdomains.slug }).from(creativeSubdomains);

    expect(domains).toHaveLength(9);
    expect(subdomains).toHaveLength(81);
  });

  it('does not overwrite a label an administrator changed', async () => {
    const [before] = await db
      .select({ name: creativeSubdomains.name })
      .from(creativeSubdomains)
      .where(eq(creativeSubdomains.slug, SUBJECT));
    originalName = before!.name;

    await db
      .update(creativeSubdomains)
      .set({ name: 'Edited In The Admin Area' })
      .where(eq(creativeSubdomains.slug, SUBJECT));

    await reseed();

    const [after] = await db
      .select({ name: creativeSubdomains.name })
      .from(creativeSubdomains)
      .where(eq(creativeSubdomains.slug, SUBJECT));

    // Before ADR 0047 this read 'Filmmakers' again, with nothing logged.
    expect(after?.name).toBe('Edited In The Admin Area');
  });

  it('does not resurrect an archived item', async () => {
    await db
      .update(creativeSubdomains)
      .set({ archivedAt: new Date() })
      .where(eq(creativeSubdomains.slug, SUBJECT));

    try {
      await reseed();

      const [after] = await db
        .select({ archivedAt: creativeSubdomains.archivedAt })
        .from(creativeSubdomains)
        .where(eq(creativeSubdomains.slug, SUBJECT));

      expect(after?.archivedAt).not.toBeNull();
    } finally {
      await db
        .update(creativeSubdomains)
        .set({ archivedAt: null })
        .where(eq(creativeSubdomains.slug, SUBJECT));
    }
  });
});
