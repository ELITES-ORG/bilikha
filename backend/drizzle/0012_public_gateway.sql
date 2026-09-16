CREATE TABLE "offer_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"subdomain_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price_min_centavos" integer,
	"price_max_centavos" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"flagged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offer_images" ADD CONSTRAINT "offer_images_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_profile_id_creative_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creative_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_subdomain_id_creative_subdomains_id_fk" FOREIGN KEY ("subdomain_id") REFERENCES "public"."creative_subdomains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offer_images_offer_order_idx" ON "offer_images" USING btree ("offer_id","sort_order");--> statement-breakpoint
CREATE INDEX "offers_profile_order_idx" ON "offers" USING btree ("profile_id","sort_order");--> statement-breakpoint
CREATE INDEX "offers_subdomain_created_idx" ON "offers" USING btree ("subdomain_id","created_at");--> statement-breakpoint
CREATE INDEX "offers_reviewed_idx" ON "offers" USING btree ("reviewed_at");