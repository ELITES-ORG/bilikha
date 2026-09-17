CREATE TYPE "public"."agreement_event_type" AS ENUM('started', 'delivery_marked', 'completion_confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agreement_status" AS ENUM('sent', 'accepted', 'superseded', 'withdrawn');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'agreement_issued';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'agreement_revision_requested';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'agreement_accepted';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'agreement_event';--> statement-breakpoint
CREATE TABLE "agreement_acceptances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"accepted_by_user_id" uuid NOT NULL,
	"content_hash" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"type" "agreement_event_type" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreement_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agreement_id" uuid NOT NULL,
	"description" text NOT NULL,
	"price_centavos" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "agreement_line_items_price_non_negative" CHECK ("agreement_line_items"."price_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "agreements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"package_title" text NOT NULL,
	"notes" text,
	"start_date" date NOT NULL,
	"duration_days" integer NOT NULL,
	"status" "agreement_status" DEFAULT 'sent' NOT NULL,
	"revision_note" text,
	"revision_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreements_duration_positive" CHECK ("agreements"."duration_days" > 0),
	CONSTRAINT "agreements_version_positive" CHECK ("agreements"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "agreement_id" uuid;--> statement-breakpoint
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_acceptances" ADD CONSTRAINT "agreement_acceptances_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_events" ADD CONSTRAINT "agreement_events_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_events" ADD CONSTRAINT "agreement_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_line_items" ADD CONSTRAINT "agreement_line_items_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreements" ADD CONSTRAINT "agreements_supersedes_id_agreements_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."agreements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_acceptances_agreement_idx" ON "agreement_acceptances" USING btree ("agreement_id");--> statement-breakpoint
CREATE INDEX "agreement_events_agreement_created_idx" ON "agreement_events" USING btree ("agreement_id","created_at");--> statement-breakpoint
CREATE INDEX "agreement_line_items_agreement_sort_idx" ON "agreement_line_items" USING btree ("agreement_id","sort_order");--> statement-breakpoint
CREATE INDEX "agreements_conversation_created_idx" ON "agreements" USING btree ("conversation_id","created_at");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_agreement_id_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."agreements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_agreement_idx" ON "messages" USING btree ("agreement_id");
