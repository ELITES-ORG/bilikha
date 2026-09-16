CREATE TABLE "portfolio_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"caption" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_items" ADD CONSTRAINT "portfolio_items_profile_id_creative_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creative_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portfolio_items_profile_order_idx" ON "portfolio_items" USING btree ("profile_id","sort_order");--> statement-breakpoint
CREATE INDEX "portfolio_items_reviewed_idx" ON "portfolio_items" USING btree ("reviewed_at");