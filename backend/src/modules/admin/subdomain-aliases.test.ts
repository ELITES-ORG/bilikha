import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, like, sql } from 'drizzle-orm';
import { createApp } from '../../app.js';
import { db } from '../../db/index.js';
import {
  creativeDomains,
  creativeSubdomains,
  searchMisses,
  subdomainAliases,
  taxonomyChanges,
} from '../../db/schema/index.js';
import { hashPassword } from '../../lib/password.js';
import { makeAdmin, makeUser, PASSWORD } from '../../test/factories.js';
import {
  addAlias,
  createDomain,
  createSubdomain,
  deleteTaxonomyItem,
  listTaxonomyForAdmin,
  removeAlias,
} from './taxonomy.service.js';

/**
 * Everyday words on a sub-domain (issue #24). Reference tables survive between
 * tests, so each case works on its own `zz-test-` sub-domain and removes it, as
 * `taxonomy.test.ts` does. Aliases go with it: they cascade.
 */
const TEST_PREFIX = 'zz-test-alias-';

afterEach(async () => {
  await db.delete(creativeSubdomains).where(like(creativeSubdomains.slug, `${TEST_PREFIX}%`));
  await db.delete(creativeDomains).where(like(creativeDomains.slug, `${TEST_PREFIX}%`));
  await db.delete(taxonomyChanges).where(like(taxonomyChanges.itemSlug, `${TEST_PREFIX}%`));
});

async function makeSubdomain(adminId: string) {
  await createDomain({ adminId, input: { slug: `${TEST_PREFIX}domain`, name: 'ZZ Alias Domain' } });
  return createSubdomain({
    adminId,
    input: {
      domainSlug: `${TEST_PREFIX}domain`,
      slug: `${TEST_PREFIX}sub`,
      name: 'ZZ Alias Makers',
      singularName: 'ZZ Alias Maker',
    },
  });
}

async function changesFor(slug: string) {
  return db
    .select()
    .from(taxonomyChanges)
    .where(and(eq(taxonomyChanges.itemSlug, slug), eq(taxonomyChanges.action, 'updated')));
}

describe('adding and removing an everyday word', () => {
  it('stores the word folded, lists it, and records the change', async () => {
    const admin = await makeAdmin();
    const sub = await makeSubdomain(admin.id);

    const alias = await addAlias({ slug: sub.slug, adminId: admin.id, term: '  Mabalóngkos ' });
    expect(alias.term).toBe('mabalongkos');

    const tree = await listTaxonomyForAdmin();
    const listed = tree.flatMap((d) => d.subdomains).find((s) => s.slug === sub.slug);
    expect(listed?.aliases).toEqual([{ id: alias.id, term: 'mabalongkos' }]);

    const [change] = await changesFor(sub.slug);
    expect(change).toMatchObject({
      adminId: admin.id,
      before: { aliases: [] },
      after: { aliases: ['mabalongkos'] },
    });
  });

  it('refuses the same word twice on one sub-domain, however it is accented', async () => {
    const admin = await makeAdmin();
    const sub = await makeSubdomain(admin.id);
    await addAlias({ slug: sub.slug, adminId: admin.id, term: 'kulitero' });

    await expect(
      addAlias({ slug: sub.slug, adminId: admin.id, term: 'KULITÉRO' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('refuses a word that is only marks or spaces', async () => {
    const admin = await makeAdmin();
    const sub = await makeSubdomain(admin.id);

    await expect(addAlias({ slug: sub.slug, adminId: admin.id, term: '́ ' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('removes a word and records what was left', async () => {
    const admin = await makeAdmin();
    const sub = await makeSubdomain(admin.id);
    const first = await addAlias({ slug: sub.slug, adminId: admin.id, term: 'kulitero' });
    await addAlias({ slug: sub.slug, adminId: admin.id, term: 'tabliyo' });

    await removeAlias({ slug: sub.slug, id: first.id, adminId: admin.id });

    const left = await db.select().from(subdomainAliases).where(eq(subdomainAliases.term, 'tabliyo'));
    expect(left).toHaveLength(1);
    const changes = await changesFor(sub.slug);
    expect(changes.at(-1)).toMatchObject({
      before: { aliases: ['kulitero', 'tabliyo'] },
      after: { aliases: ['tabliyo'] },
    });
  });

  it("will not remove another sub-domain's word through this one", async () => {
    const admin = await makeAdmin();
    const sub = await makeSubdomain(admin.id);
    const [seeded] = await db.select().from(creativeSubdomains).limit(1);
    const [elsewhere] = await db
      .insert(subdomainAliases)
      .values({ subdomainId: seeded!.id, term: 'zqelsewhere' })
      .returning();

    await expect(
      removeAlias({ slug: sub.slug, id: elsewhere!.id, adminId: admin.id }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('goes with its sub-domain when that is deleted', async () => {
    const admin = await makeAdmin();
    const sub = await makeSubdomain(admin.id);
    await addAlias({ slug: sub.slug, adminId: admin.id, term: 'kulitero' });

    await deleteTaxonomyItem({ kind: 'subdomains', slug: sub.slug, adminId: admin.id });

    expect(await db.select().from(subdomainAliases).where(eq(subdomainAliases.term, 'kulitero'))).toEqual(
      [],
    );
  });
});

describe('the alias and unmatched-search endpoints', () => {
  let server: Server;
  let base: string;

  beforeAll(() => {
    server = createApp().listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
  });

  afterAll(() => {
    server.close();
  });

  async function signIn(username: string): Promise<string> {
    const response = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: PASSWORD }),
    });
    expect(response.status).toBe(200);
    // Read to the end so the session row exists before the next request (see
    // error-check.test.ts).
    await response.text();
    return response.headers.get('set-cookie')!.split(';')[0]!;
  }

  it('lets an administrator add and remove a word, and lists unmatched searches', async () => {
    const admin = await makeAdmin({ passwordHash: await hashPassword(PASSWORD) });
    const sub = await makeSubdomain(admin.id);
    const cookie = await signIn(admin.username);
    const json = { cookie, 'content-type': 'application/json' };

    const added = await fetch(`${base}/admin/taxonomy/subdomains/${sub.slug}/aliases`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ term: 'Kulitero' }),
    });
    expect(added.status).toBe(201);
    const { data } = (await added.json()) as { data: { id: string; term: string } };
    expect(data.term).toBe('kulitero');

    const removed = await fetch(`${base}/admin/taxonomy/subdomains/${sub.slug}/aliases/${data.id}`, {
      method: 'DELETE',
      headers: { cookie },
    });
    expect(removed.status).toBe(200);

    await db
      .insert(searchMisses)
      .values({ term: 'zqendpoint', listing: 'offers', count: 2, day: sql`current_date` });
    const misses = await fetch(`${base}/admin/search-misses?days=7`, { headers: { cookie } });
    expect(misses.status).toBe(200);
    const listed = ((await misses.json()) as { data: { term: string; count: number }[] }).data;
    expect(listed).toContainEqual({ term: 'zqendpoint', listing: 'offers', count: 2 });
  });

  it('is not there for anyone else', async () => {
    const admin = await makeAdmin();
    const sub = await makeSubdomain(admin.id);
    const user = await makeUser({ passwordHash: await hashPassword(PASSWORD) });
    const cookie = await signIn(user.username);

    const add = await fetch(`${base}/admin/taxonomy/subdomains/${sub.slug}/aliases`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ term: 'kulitero' }),
    });
    const misses = await fetch(`${base}/admin/search-misses`);

    expect(add.status).toBe(404);
    expect(misses.status).toBe(404);
    expect(await db.select().from(subdomainAliases)).toEqual([]);
  });
});
