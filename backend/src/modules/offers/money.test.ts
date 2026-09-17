import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, sql } from '../../db/index.js';
import { offers, postings } from '../../db/schema/index.js';
import { makeCreative, makeOffer, makePosting, makeUser } from '../../test/factories.js';

/**
 * Money is integer centavos everywhere. A float here is not a rounding
 * inconvenience — it is a price that disagrees with itself between two screens.
 */
describe('money is centavos, exactly', () => {
  it('stores and returns a price unchanged', async () => {
    const { profile } = await makeCreative();
    const offer = await makeOffer(profile.id, {
      priceMinCentavos: 1_000_000, // ₱10,000.00
      priceMaxCentavos: 5_000_000, // ₱50,000.00
    });

    const [row] = await db.select().from(offers).where(eq(offers.id, offer.id));
    expect(row?.priceMinCentavos).toBe(1_000_000);
    expect(row?.priceMaxCentavos).toBe(5_000_000);
  });

  it('keeps an amount that would lose precision as a float', async () => {
    // 0.1 + 0.2 territory: this value is not representable exactly in binary
    // floating point when expressed as pesos.
    const { profile } = await makeCreative();
    const offer = await makeOffer(profile.id, { priceMinCentavos: 333_333_33 });

    const [row] = await db.select().from(offers).where(eq(offers.id, offer.id));
    expect(row?.priceMinCentavos).toBe(333_333_33);
  });

  it('allows a minimum with no maximum — "from ₱X"', async () => {
    const { profile } = await makeCreative();
    const offer = await makeOffer(profile.id, { priceMinCentavos: 250_000, priceMaxCentavos: null });

    const [row] = await db.select().from(offers).where(eq(offers.id, offer.id));
    expect(row?.priceMinCentavos).toBe(250_000);
    expect(row?.priceMaxCentavos).toBeNull();
  });

  it('allows no price at all — "price on request"', async () => {
    const { profile } = await makeCreative();
    const offer = await makeOffer(profile.id);

    const [row] = await db.select().from(offers).where(eq(offers.id, offer.id));
    expect(row?.priceMinCentavos).toBeNull();
  });

  it('refuses an amount beyond the integer column rather than truncating it', async () => {
    const { profile } = await makeCreative();
    await expect(
      makeOffer(profile.id, { priceMinCentavos: 2_147_483_648 }),
    ).rejects.toThrow();
  });

  it('stores posting budgets the same way', async () => {
    const client = await makeUser();
    const posting = await makePosting(client.id, {
      budgetMinCentavos: 200_000,
      budgetMaxCentavos: 500_000,
    });

    const [row] = await db.select().from(postings).where(eq(postings.id, posting.id));
    expect(row?.budgetMinCentavos).toBe(200_000);
    expect(row?.budgetMaxCentavos).toBe(500_000);
  });

  it('has no floating-point money column anywhere in the schema', async () => {
    // The guard that does not depend on anyone remembering: ask the database.
    const rows = await sql<{ table_name: string; column_name: string; data_type: string }[]>`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and (column_name like '%centavos%' or column_name like '%price%'
             or column_name like '%budget%' or column_name like '%amount%')
        and data_type not in ('integer', 'bigint')
    `;

    expect(rows).toEqual([]);
  });
});
