CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "creative_subdomains_search_idx" ON "creative_subdomains" USING gin (to_tsvector('simple', name || ' ' || singular_name));--> statement-breakpoint
CREATE INDEX "creative_subdomains_name_trgm_idx" ON "creative_subdomains" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "creative_subdomains_singular_name_trgm_idx" ON "creative_subdomains" USING gin ("singular_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_full_name_trgm_idx" ON "users" USING gin ((first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "creative_profiles_search_idx" ON "creative_profiles" USING gin (to_tsvector('simple', coalesce(display_name, '') || ' ' || coalesce(bio, '')));--> statement-breakpoint
CREATE INDEX "creative_profiles_display_name_trgm_idx" ON "creative_profiles" USING gin ("display_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "offers_search_idx" ON "offers" USING gin (to_tsvector('simple', title || ' ' || coalesce(description, '')));--> statement-breakpoint
CREATE INDEX "offers_title_trgm_idx" ON "offers" USING gin ("title" gin_trgm_ops);