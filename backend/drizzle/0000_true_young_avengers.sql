CREATE TABLE "creative_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_subdomains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "municipalities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"psgc_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_subdomains" ADD CONSTRAINT "creative_subdomains_domain_id_creative_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."creative_domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_domains_slug_idx" ON "creative_domains" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_subdomains_slug_idx" ON "creative_subdomains" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "creative_subdomains_domain_idx" ON "creative_subdomains" USING btree ("domain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "municipalities_slug_idx" ON "municipalities" USING btree ("slug");