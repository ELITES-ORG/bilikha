ALTER TYPE "public"."notification_type" ADD VALUE 'cover_rejected' BEFORE 'attachment_expiring';--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "cover_key" text;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "cover_small_key" text;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "cover_pending_key" text;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "cover_pending_small_key" text;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "cover_rejection_reason" text;