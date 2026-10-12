import { pgTable, uuid, text, bigint, integer, timestamp, uniqueIndex, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { users } from './users.js';
import { offers } from './profiles.js';
import { mediaKindEnum, uploadDestinationEnum } from './media-enums.js';

/**
 * An upload ticket that has been issued and not yet attached (ADR 0046). It
 * reserves its kind's largest size against the uploader's quota, and counts
 * toward the target's per-kind limit, until it is attached, abandoned or
 * expires. Attaching deletes it.
 */
export const mediaUploads = pgTable(
  'media_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    destination: uploadDestinationEnum('destination').notNull(),
    offerId: uuid('offer_id').references(() => offers.id, { onDelete: 'cascade' }),
    kind: mediaKindEnum('kind').notNull(),
    bucket: text('bucket').notNull(),
    objectKey: text('object_key').notNull(),
    // An image's thumbnail or a video's poster. Always in the image bucket.
    thumbKey: text('thumb_key'),
    // Normalised: `audio/x-m4a` is stored as `audio/mp4`.
    mimeType: text('mime_type').notNull(),
    // What the browser declared for the main file. Verification requires the
    // stored object to match it.
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    thumbSizeBytes: integer('thumb_size_bytes'),
    // Whole seconds, rounded up.
    durationSeconds: integer('duration_seconds'),
    reservedBytes: bigint('reserved_bytes', { mode: 'number' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('media_uploads_object_key_idx').on(table.objectKey),
    index('media_uploads_user_expiry_idx').on(table.userId, table.expiresAt),
    index('media_uploads_offer_kind_idx').on(table.offerId, table.kind),
    check('media_uploads_offer_has_offer_id', sql`${table.destination} <> 'offer' OR ${table.offerId} IS NOT NULL`),
  ],
);

export type MediaUpload = typeof mediaUploads.$inferSelect;
