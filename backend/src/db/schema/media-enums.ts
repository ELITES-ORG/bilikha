import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * In a file of their own so `media.ts` and `profiles.ts` can both use them
 * without importing each other (ADR 0046).
 */
export const mediaKindEnum = pgEnum('media_kind', ['image', 'audio', 'video', 'document']);

/** Where an upload is going. #66 adds `message`. */
export const uploadDestinationEnum = pgEnum('upload_destination', ['offer']);
