CREATE TYPE "public"."taxonomy_change_action" AS ENUM('created', 'updated', 'archived', 'restored', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_item_kind" AS ENUM('domain', 'subdomain');--> statement-breakpoint
CREATE TABLE "taxonomy_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_kind" "taxonomy_item_kind" NOT NULL,
	"item_slug" text NOT NULL,
	"action" "taxonomy_change_action" NOT NULL,
	"admin_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_domains" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "creative_subdomains" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "taxonomy_changes" ADD CONSTRAINT "taxonomy_changes_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "taxonomy_changes_item_idx" ON "taxonomy_changes" USING btree ("item_kind","item_slug");--> statement-breakpoint
CREATE INDEX "taxonomy_changes_created_idx" ON "taxonomy_changes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "creative_domains_active_idx" ON "creative_domains" USING btree ("display_order") WHERE archived_at is null;--> statement-breakpoint
CREATE INDEX "creative_subdomains_active_idx" ON "creative_subdomains" USING btree ("domain_id","display_order") WHERE archived_at is null;