/**
 * Seed the local verification fixtures for an account.
 *
 * Why this exists: two audits in a row found that the data used to verify a
 * change only covered the happy path. Three postings that are all `open`, all a
 * week from expiry and all without replies exercise one branch of four — so a
 * badge that renders the wrong tone for an expired posting survives a pass that
 * claims to have looked at the badges. Fixtures that live only in one laptop's
 * Postgres get rebuilt from scratch, badly, every time.
 *
 * This is local-only and deliberately blunt: it writes directly to the database
 * rather than going through the API, because the point is to reach states the
 * API will not hand you on demand (a posting the sweep has already expired, a
 * posting somebody replied to).
 *
 *   node scripts/seed-fixtures.mjs                    # default account
 *   node scripts/seed-fixtures.mjs --user cre0299739
 *   node scripts/seed-fixtures.mjs --serve            # also serve the offer image
 *
 * `--serve` starts a tiny origin that answers Supabase's public-read path, so an
 * offer thumbnail can be seen without working uploads. It prints the one-line
 * env override to run the API against it. Nothing about the product changes:
 * `publicUrl` builds the same URL it always does, this just answers it.
 */
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from '../backend/node_modules/postgres/src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : (args[i + 1] ?? true);
};
const USER = flag('user', 'cre0299739');
const SERVE = args.includes('--serve');
// Not 5174: that is Vite's fallback port, and a second dev server sitting there
// silently wins `localhost` on Windows while this still binds the IPv6 side.
const PORT = Number(flag('port', 5199));
const STORAGE_PATH_PREFIX = '/storage/v1/object/public/';

function databaseUrl() {
  const envPath = path.join(ROOT, 'backend', '.env');
  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('DATABASE_URL='));
  if (!line) throw new Error(`No DATABASE_URL in ${envPath}`);
  return line.slice('DATABASE_URL='.length).trim();
}

/**
 * A 2×2 mid-grey PNG, inline so no binary lands in the repo and nothing a
 * fixture needs can be mistaken for a product asset. It only has to prove the
 * row renders an image rather than the placeholder.
 */
const THUMB_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8//8/AzbAxIAD' +
    'jEqMSgAAJ0QDEZ0k3WcAAAAASUVORK5CYII=',
  'base64',
);

const hours = (n) => `${n} hours`;

/**
 * Each row names the branch it exists to exercise. If you add a state to the
 * page, add the fixture that renders it here — that is the whole contract.
 */
const POSTINGS = [
  { title: 'Urgent mural touch-up (under 24h)', status: 'open', expires: hours(11), why: 'danger expiry tone' },
  { title: 'Lapsed open posting (past expiresAt)', status: 'open', expires: hours(-48), why: 'open but past expiry — must read the same as expired' },
  { title: 'Status-expired posting', status: 'expired', expires: hours(-120), why: 'expired status badge' },
  { title: 'Deliberately closed posting', status: 'closed', expires: hours(479), why: 'closed status badge, distinct from expired' },
];

const sql = postgres(databaseUrl(), { max: 2 });

async function main() {
  const [user] = await sql`
    select u.id as user_id, cp.id as profile_id, u.municipality_id
    from users u
    left join creative_profiles cp on cp.user_id = u.id
    where u.username = ${USER}
  `;
  if (!user) throw new Error(`No user ${USER}. Pass --user <username>.`);

  const [sub] = await sql`select id from creative_subdomains order by name limit 1`;
  const [muni] = user.municipality_id
    ? [{ id: user.municipality_id }]
    : await sql`select id from municipalities order by name limit 1`;

  for (const row of POSTINGS) {
    const [existing] = await sql`
      select id from postings where user_id = ${user.user_id} and title = ${row.title}
    `;
    if (existing) {
      await sql`
        update postings
        set status = ${row.status}::posting_status,
            expires_at = now() + ${row.expires}::interval
        where id = ${existing.id}
      `;
      console.log(`  updated  ${row.title}  (${row.why})`);
    } else {
      await sql`
        insert into postings (user_id, subdomain_id, municipality_id, title, description,
                              budget_min_centavos, budget_max_centavos, status, expires_at)
        values (${user.user_id}, ${sub.id}, ${muni.id}, ${row.title},
                ${'Verification fixture — ' + row.why}, 150000, 400000,
                ${row.status}::posting_status, now() + ${row.expires}::interval)
      `;
      console.log(`  created  ${row.title}  (${row.why})`);
    }
  }

  if (!user.profile_id) {
    console.log('\nNo creative profile — skipping the offer image fixture.');
  } else {
    const [offer] = await sql`
      select id from offers where profile_id = ${user.profile_id} order by sort_order limit 1
    `;
    if (!offer) {
      console.log('\nNo offers — skipping the offer image fixture.');
    } else {
      // An earlier fixture stored an absolute URL as the object key, which only
      // rendered because publicUrl had been widened to pass such keys through.
      // That widening is reverted, so those rows would now build nonsense URLs.
      const stale = await sql`
        delete from offer_images
        where offer_id = ${offer.id} and (object_key like 'http%' or thumb_key like 'http%')
        returning id
      `;
      if (stale.length > 0) {
        console.log(`\n  removed ${stale.length} image row(s) keyed by absolute URL`);
      }

      const objectKey = `offers/${user.profile_id}/fixture-full.png`;
      const thumbKey = `offers/${user.profile_id}/fixture-thumb.png`;
      const [image] = await sql`
        select id from offer_images where offer_id = ${offer.id} and thumb_key = ${thumbKey}
      `;
      if (!image) {
        await sql`
          insert into offer_images (offer_id, object_key, thumb_key, sort_order)
          values (${offer.id}, ${objectKey}, ${thumbKey}, 0)
        `;
      }
      console.log(`\n  offer image row -> ${thumbKey}`);
      console.log('  (a real object key, so publicUrl builds the URL it always builds)');
    }
  }

  console.log('\nBranches now reachable on /postings/mine:');
  console.log('  danger / warning / neutral expiry, Expired, Closed.');
  console.log('To exercise the Delete gate, reply to one posting as another account —');
  console.log('a reply is a conversation between two real users and is not seeded here.');

  if (SERVE) {
    await serveStorage();
  } else {
    await sql.end();
  }
}

function serveStorage() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (!req.url.startsWith(STORAGE_PATH_PREFIX)) {
        res.writeHead(404).end('not a storage path');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(THUMB_PNG);
    });
    server.on('error', (error) => {
      console.error(`\nCould not serve on port ${PORT}: ${error.message}`);
      console.error('Pass --port <n> for a free one. Do not ignore this — a half-bound');
      console.error('server hands the browser whatever else is on that port.');
      process.exit(1);
    });
    // Explicitly IPv4: binding the wildcard would succeed on the IPv6 side alone
    // when something already holds 0.0.0.0:PORT, and `localhost` would then
    // resolve to the other process.
    server.listen(PORT, '127.0.0.1', () => {
      console.log(`\nServing every ${STORAGE_PATH_PREFIX}* on http://localhost:${PORT}`);
      console.log('Run the API against it so publicUrl resolves here:');
      console.log(`\n  SUPABASE_URL=http://localhost:${PORT} npm run dev:api\n`);
      console.log('Ctrl-C to stop.');
      resolve();
    });
  });
}

main().catch(async (error) => {
  console.error(error.message);
  await sql.end();
  process.exit(1);
});
