CREATE TYPE "public"."offer_image_state" AS ENUM('live', 'pending_add', 'pending_remove');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('pending_review', 'published', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'offer_approved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'offer_rejected';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'avatar_rejected';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'logo_rejected';--> statement-breakpoint
CREATE TABLE "offer_revisions" (
	"offer_id" uuid PRIMARY KEY NOT NULL,
	"subdomain_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price_min_centavos" integer,
	"price_max_centavos" integer,
	"flagged_at" timestamp with time zone,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_pending_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "offer_images" ADD COLUMN "state" "offer_image_state" DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "status" "offer_status" DEFAULT 'pending_review' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "revision_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_pending_key" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "offer_revisions" ADD CONSTRAINT "offer_revisions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_revisions" ADD CONSTRAINT "offer_revisions_subdomain_id_creative_subdomains_id_fk" FOREIGN KEY ("subdomain_id") REFERENCES "public"."creative_subdomains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_actions_offer_idx" ON "moderation_actions" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offers_status_idx" ON "offers" USING btree ("status");