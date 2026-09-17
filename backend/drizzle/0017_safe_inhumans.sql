CREATE TYPE "public"."view_mode" AS ENUM('hiring', 'creative');--> statement-breakpoint
CREATE TYPE "public"."posting_status" AS ENUM('open', 'closed', 'expired');--> statement-breakpoint
CREATE TABLE "postings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subdomain_id" uuid NOT NULL,
	"municipality_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"budget_min_centavos" integer,
	"budget_max_centavos" integer,
	"status" "posting_status" DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reviewed_at" timestamp with time zone,
	"flagged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "view_mode" "view_mode" DEFAULT 'hiring' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "posting_id" uuid;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_subdomain_id_creative_subdomains_id_fk" FOREIGN KEY ("subdomain_id") REFERENCES "public"."creative_subdomains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postings" ADD CONSTRAINT "postings_municipality_id_municipalities_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "public"."municipalities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "postings_user_created_idx" ON "postings" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "postings_subdomain_status_idx" ON "postings" USING btree ("subdomain_id","status","expires_at");--> statement-breakpoint
CREATE INDEX "postings_reviewed_idx" ON "postings" USING btree ("reviewed_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_posting_id_postings_id_fk" FOREIGN KEY ("posting_id") REFERENCES "public"."postings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_posting_idx" ON "messages" USING btree ("posting_id");