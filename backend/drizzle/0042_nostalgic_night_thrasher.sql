ALTER TYPE "public"."notification_type" ADD VALUE 'attachment_expiring';--> statement-breakpoint
ALTER TYPE "public"."upload_destination" ADD VALUE 'message';--> statement-breakpoint
CREATE TABLE "message_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"object_key" text NOT NULL,
	"thumb_key" text,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"duration_seconds" integer,
	"expires_at" timestamp with time zone,
	"file_deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_uploads" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "message_attachments" ADD CONSTRAINT "message_attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "message_attachments_object_key_idx" ON "message_attachments" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "message_attachments_message_idx" ON "message_attachments" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "message_attachments_expiry_idx" ON "message_attachments" USING btree ("expires_at") WHERE file_deleted_at is null and expires_at is not null;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_uploads_conversation_user_idx" ON "media_uploads" USING btree ("conversation_id","user_id");--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_message_has_conversation_id" CHECK ("media_uploads"."destination"::text <> 'message' OR "media_uploads"."conversation_id" IS NOT NULL);