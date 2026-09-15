ALTER TYPE "public"."moderation_action" ADD VALUE 'acknowledged_edit';--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "edited_since_review_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "creative_profiles_edited_idx" ON "creative_profiles" USING btree ("edited_since_review_at");