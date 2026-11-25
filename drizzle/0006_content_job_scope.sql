ALTER TABLE "content_jobs" ADD COLUMN "scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "content_jobs" ADD COLUMN "options" jsonb DEFAULT '{}'::jsonb NOT NULL;