CREATE TYPE "public"."id_verification_status" AS ENUM('pending', 'verified', 'declined_retry', 'declined_final', 'appealed');--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'id_viewed';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'id_verified';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'id_declined_retry';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'id_declined_final';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'id_decision_reversed';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'id_appeal_granted';--> statement-breakpoint
ALTER TYPE "public"."moderation_action" ADD VALUE 'id_appeal_upheld';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'id_verified';--> statement-breakpoint
CREATE TABLE "id_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "id_verification_status" DEFAULT 'pending' NOT NULL,
	"id_type" text,
	"front_key" text,
	"back_key" text,
	"id_consent_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"images_deleted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"decision_reason" text,
	"id_number_hash" text,
	"id_number_absent" boolean DEFAULT false NOT NULL,
	"appeal_message" text,
	"appealed_at" timestamp with time zone,
	"appeal_decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD COLUMN "id_verification_id" uuid;--> statement-breakpoint
ALTER TABLE "id_verifications" ADD CONSTRAINT "id_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "id_verifications" ADD CONSTRAINT "id_verifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "id_verifications_user_created_idx" ON "id_verifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "id_verifications_queue_idx" ON "id_verifications" USING btree ("submitted_at") WHERE status in ('pending', 'appealed') and submitted_at is not null;--> statement-breakpoint
CREATE INDEX "id_verifications_sweep_idx" ON "id_verifications" USING btree ("decided_at") WHERE images_deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "id_verifications_one_open_idx" ON "id_verifications" USING btree ("user_id") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "id_verifications_id_number_hash_idx" ON "id_verifications" USING btree ("id_number_hash") WHERE id_number_hash is not null;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_id_verification_id_id_verifications_id_fk" FOREIGN KEY ("id_verification_id") REFERENCES "public"."id_verifications"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_actions_id_verification_idx" ON "moderation_actions" USING btree ("id_verification_id");