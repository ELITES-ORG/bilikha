CREATE TYPE "public"."inquiry_status" AS ENUM('sent', 'read', 'responded', 'declined');--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"message" text NOT NULL,
	"status" "inquiry_status" DEFAULT 'sent' NOT NULL,
	"response" text,
	"read_at" timestamp with time zone,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_profiles" ADD COLUMN "contact_preference" text DEFAULT 'phone' NOT NULL;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_profile_id_creative_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."creative_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiries_profile_created_idx" ON "inquiries" USING btree ("profile_id","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_sender_created_idx" ON "inquiries" USING btree ("sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_status_idx" ON "inquiries" USING btree ("status");