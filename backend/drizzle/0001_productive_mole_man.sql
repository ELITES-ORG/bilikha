CREATE TYPE "public"."account_type" AS ENUM('individual', 'organization');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('draft', 'pending_review', 'published', 'suspended');--> statement-breakpoint
CREATE TABLE "barangays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"municipality_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"psgc_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"username_normalized" text NOT NULL,
	"email" text NOT NULL,
	"email_normalized" text NOT NULL,
	"phone" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"suffix" text,
	"birth_date" date NOT NULL,
	"account_type" "account_type" DEFAULT 'individual' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"municipality_id" uuid NOT NULL,
	"barangay_id" uuid,
	"privacy_consent_at" timestamp with time zone NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"consent_version" text NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_profile_subdomains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"subdomain_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text,
	"bio" text,
	"status" "profile_status" DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "barangays" ADD CONSTRAINT "barangays_municipality_id_municipalities_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "public"."municipalities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_municipality_id_municipalities_id_fk" FOREIGN KEY ("municipality_id") REFERENCES "public"."municipalities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_barangay_id_barangays_id_fk" FOREIGN KEY ("barangay_id") REFERENCES "public"."barangays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_profile_subdomains" ADD CONSTRAINT "creative_profile_subdomains_profile_id_creative_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creative_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_profile_subdomains" ADD CONSTRAINT "creative_profile_subdomains_subdomain_id_creative_subdomains_id_fk" FOREIGN KEY ("subdomain_id") REFERENCES "public"."creative_subdomains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD CONSTRAINT "creative_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "barangays_municipality_slug_idx" ON "barangays" USING btree ("municipality_id","slug");--> statement-breakpoint
CREATE INDEX "barangays_municipality_idx" ON "barangays" USING btree ("municipality_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_normalized_idx" ON "users" USING btree ("username_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_normalized_idx" ON "users" USING btree ("email_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_idx" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "users_municipality_idx" ON "users" USING btree ("municipality_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cps_profile_subdomain_idx" ON "creative_profile_subdomains" USING btree ("profile_id","subdomain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cps_one_primary_per_profile_idx" ON "creative_profile_subdomains" USING btree ("profile_id") WHERE is_primary;--> statement-breakpoint
CREATE INDEX "cps_subdomain_idx" ON "creative_profile_subdomains" USING btree ("subdomain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_profiles_user_idx" ON "creative_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_profiles_slug_idx" ON "creative_profiles" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "creative_profiles_status_idx" ON "creative_profiles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");