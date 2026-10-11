import { and, desc, or, sql, type SQL } from 'drizzle-orm';
import {
  creativeDomains,
  creativeProfiles,
  creativeSubdomains,
  municipalities,
  offers,
  users,
} from '../../db/schema/index.js';

/**
 * Directory search (ADR 0003, as amended). One place for the matching rules, so
 * offers and creatives cannot drift apart.
 *
 * The query is split into words, and **every word must match some field** of
 * the row, by either path:
 *
 * - **Prefix.** `to_tsvector('simple', field) @@ to_tsquery('simple', 'word:*')`.
 *   `simple` does no stemming, so it treats English, Tagalog and Waray alike.
 * - **Typo.** pg_trgm word similarity, on short name-like fields, for words
 *   of `TYPO_MIN_LENGTH` characters or more: `'word' <% field` (the default
 *   threshold, 0.6) for a short word, and a looser `LONG_WORD_SIMILARITY` for
 *   a word of `LONG_WORD_LENGTH` or more.
 *
 * So "photographer naval" finds a photographer in Naval: one word matches the
 * craft, the other the town.
 *
 * The documents below are written exactly as the GIN index expressions in the
 * schema files are. Change one, change the other, or the index goes unused.
 */

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
/** Trigrams say nothing useful about one or two characters. */
export const TYPO_MIN_LENGTH = 3;
/**
 * A dropped letter costs a long word more trigrams than the default threshold
 * allows: "develper" scores 0.56 against "Developers". Measured over every
 * seeded sub-domain and town name, a one-letter drop in a word of 6–7 letters
 * was found 26% of the time at 0.6 and 93% at 0.5, and 72% → 100% at 8 or
 * more. The extra loose matches are mostly kindred crafts ("artisans" and
 * "artists"), and they sort after every match as typed. Short words keep 0.6:
 * lowering it found few more dropped letters and matched more unrelated names.
 */
export const LONG_WORD_LENGTH = 6;
export const LONG_WORD_SIMILARITY = 0.5;
/** Words past this are ignored; each one adds a condition per field. */
export const SEARCH_MAX_WORDS = 8;

/**
 * The words of a query, lowercased. Only letters, marks and digits survive, so
 * no input can reach tsquery syntax (`& | ! ( ) : * <->` and quotes).
 */
export function searchWords(q: string): string[] {
  return q
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter((word) => word.length > 0)
    .slice(0, SEARCH_MAX_WORDS);
}

export interface SearchSql {
  /** Add to the listing's filters. */
  where: SQL;
  /** Insert after nearby-first and before newest. */
  orderBy: SQL[];
}

interface Fields {
  /** Whole documents, matched by prefix. */
  documents: SQL[];
  /** Short name-like fields, matched by typo too. */
  names: SQL[];
  /** The field whose closeness ranks results among the matches. */
  main: SQL;
  /** Matches outside the row itself, e.g. over all of a creative's sub-domains. */
  related?: (word: string, typos: boolean) => { prefix: SQL; any: SQL };
}

function prefixMatch(document: SQL, word: string): SQL {
  return sql`to_tsvector('simple', ${document}) @@ to_tsquery('simple', ${`${word}:*`})`;
}

function typoMatch(field: SQL, word: string): SQL {
  // A search ORs across joined tables, so neither form uses a trigram index
  // today (ADR 0003); `<%` is kept where it applies, for when one can.
  return word.length >= LONG_WORD_LENGTH
    ? sql`word_similarity(${word}::text, (${field})) >= ${LONG_WORD_SIMILARITY}`
    : sql`${word}::text <% (${field})`;
}

function build(q: string, fields: Fields): SearchSql {
  const words = searchWords(q);
  // Nothing searchable was typed, so nothing matches — not everything.
  if (words.length === 0) return { where: sql`false`, orderBy: [] };

  const perWord = words.map((word) => {
    const typos = word.length >= TYPO_MIN_LENGTH;
    const related = fields.related?.(word, typos);
    const prefixes = [
      ...fields.documents.map((doc) => prefixMatch(doc, word)),
      ...(related ? [related.prefix] : []),
    ];
    const any = [
      ...prefixes,
      ...(typos ? fields.names.map((name) => typoMatch(name, word)) : []),
      ...(related ? [related.any] : []),
    ];
    return { prefix: or(...prefixes)!, any: or(...any)! };
  });

  const where = and(...perWord.map((match) => match.any))!;

  // Rows where every word matched as typed come before typo-only ones, then
  // the closest main field. Null-safe: a null sorts first under `desc`.
  const text = words.join(' ');
  const orderBy = [
    desc(sql`coalesce(${and(...perWord.map((match) => match.prefix))}, false)`),
    desc(sql`coalesce(word_similarity(${text}::text, ${fields.main}), 0)`),
  ];

  return { where, orderBy };
}

/** Title, description, sub-domain, domain, the creative's display name, and their town. */
export function offerSearch(q: string): SearchSql {
  return build(q, {
    documents: [
      sql`${offers.title} || ' ' || coalesce(${offers.description}, '')`,
      sql`${creativeSubdomains.name} || ' ' || ${creativeSubdomains.singularName}`,
      // The domain is the eyebrow on every card ("Digital Interactive Media").
      // Nine rows, so no index.
      sql`${creativeDomains.name}`,
      sql`coalesce(${creativeProfiles.displayName}, '')`,
      sql`${municipalities.name}`,
    ],
    names: [
      sql`${offers.title}`,
      sql`${creativeSubdomains.name}`,
      sql`${creativeSubdomains.singularName}`,
      sql`${creativeDomains.name}`,
      sql`${creativeProfiles.displayName}`,
      sql`${municipalities.name}`,
    ],
    main: sql`${offers.title}`,
  });
}

/** Display name, full name, bio, any of their sub-domains and those domains, and their town. */
export function creativeSearch(q: string): SearchSql {
  // The middle name is usually the mother's surname, and people know
  // creatives by it, so it is searchable too.
  const fullName = sql`${users.firstName} || ' ' || coalesce(${users.middleName}, '') || ' ' || ${users.lastName}`;
  return build(q, {
    documents: [
      sql`coalesce(${creativeProfiles.displayName}, '') || ' ' || coalesce(${creativeProfiles.bio}, '')`,
      fullName,
      sql`${municipalities.name}`,
    ],
    names: [sql`${creativeProfiles.displayName}`, fullName, sql`${municipalities.name}`],
    main: sql`coalesce(${creativeProfiles.displayName}, ${fullName})`,
    related: (word, typos) => {
      const subdomainWhere = (match: SQL) => sql`exists (
        select 1 from creative_profile_subdomains cps
        join creative_subdomains cs on cs.id = cps.subdomain_id
        join creative_domains cd on cd.id = cs.domain_id
        where cps.profile_id = ${creativeProfiles.id}
          and ${match}
      )`;
      const prefix = subdomainWhere(
        or(
          prefixMatch(sql`cs.name || ' ' || cs.singular_name`, word),
          prefixMatch(sql`cd.name`, word),
        )!,
      );
      const typo = or(
        typoMatch(sql`cs.name`, word),
        typoMatch(sql`cs.singular_name`, word),
        typoMatch(sql`cd.name`, word),
      )!;
      return { prefix, any: typos ? subdomainWhere(typo) : prefix };
    },
  });
}
