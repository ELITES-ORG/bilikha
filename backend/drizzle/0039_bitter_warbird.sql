CREATE TYPE "public"."media_kind" AS ENUM('image', 'audio', 'video', 'document');--> statement-breakpoint
CREATE TYPE "public"."upload_destination" AS ENUM('offer');--> statement-breakpoint
CREATE TABLE "media_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"destination" "upload_destination" NOT NULL,
	"offer_id" uuid,
	"kind" "media_kind" NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"thumb_key" text,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"thumb_size_bytes" integer,
	"duration_seconds" integer,
	"reserved_bytes" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_uploads_offer_has_offer_id" CHECK ("media_uploads"."destination" <> 'offer' OR "media_uploads"."offer_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "offer_images" ADD COLUMN "kind" "media_kind" DEFAULT 'image' NOT NULL;--> statement-breakpoint
ALTER TABLE "offer_images" ADD COLUMN "mime_type" text;--> statement-breakpoint
ALTER TABLE "offer_images" ADD COLUMN "size_bytes" bigint;--> statement-breakpoint
ALTER TABLE "offer_images" ADD COLUMN "duration_seconds" integer;--> statement-breakpoint
ALTER TABLE "offer_images" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_uploads" ADD CONSTRAINT "media_uploads_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_uploads_object_key_idx" ON "media_uploads" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "media_uploads_user_expiry_idx" ON "media_uploads" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "media_uploads_offer_kind_idx" ON "media_uploads" USING btree ("offer_id","kind");