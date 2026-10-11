-- Content review (ADR 0058): new offers, photos and logos wait for approval.
-- Everything already approved stays public; everything that never was goes
-- into the review queue, hidden, as a new submission would.

-- Offers an administrator approved stay on the directory. The rest keep the
-- column default, pending_review: hidden until approved.
UPDATE "offers" SET "status" = 'published' WHERE "reviewed_at" IS NOT NULL;--> statement-breakpoint

-- A photo nobody has approved becomes a pending one: its owner still sees it,
-- the public sees initials until it is approved.
UPDATE "users"
SET "avatar_pending_key" = "avatar_key", "avatar_key" = NULL
WHERE "avatar_key" IS NOT NULL AND "avatar_reviewed_at" IS NULL;--> statement-breakpoint

-- The same for organisation logos.
UPDATE "organizations"
SET "logo_pending_key" = "logo_key", "logo_key" = NULL
WHERE "logo_key" IS NOT NULL AND "logo_reviewed_at" IS NULL;
