CREATE TABLE "search_misses" (
	"term" text NOT NULL,
	"listing" text NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "search_misses_term_listing_day_pk" PRIMARY KEY("term","listing","day")
);
--> statement-breakpoint
CREATE TABLE "subdomain_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subdomain_id" uuid NOT NULL,
	"term" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subdomain_aliases" ADD CONSTRAINT "subdomain_aliases_subdomain_id_creative_subdomains_id_fk" FOREIGN KEY ("subdomain_id") REFERENCES "public"."creative_subdomains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_misses_day_idx" ON "search_misses" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "subdomain_aliases_subdomain_term_idx" ON "subdomain_aliases" USING btree ("subdomain_id","term");--> statement-breakpoint
CREATE INDEX "subdomain_aliases_term_idx" ON "subdomain_aliases" USING btree ("term");