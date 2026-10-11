ALTER TYPE "public"."notification_type" ADD VALUE 'organization_approved';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'organization_rejected';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'organization_invited';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'organization_invitation_accepted';--> statement-breakpoint
CREATE TABLE "retired_organization_slugs" (
	"slug" text PRIMARY KEY NOT NULL,
	"retired_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_actions_organization_idx" ON "moderation_actions" USING btree ("organization_id");