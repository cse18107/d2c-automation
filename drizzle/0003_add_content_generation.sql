CREATE TYPE "public"."content_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."creative_kind" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."creative_status" AS ENUM('queued', 'running', 'generated', 'blocked', 'pending_review', 'failed', 'expired', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."listing_target" AS ENUM('marketplace', 'ad_copy');--> statement-breakpoint
CREATE TYPE "public"."pkr_status" AS ENUM('generated', 'superseded');--> statement-breakpoint
CREATE TABLE "ai_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"content_job_id" uuid,
	"purpose" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model_id" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"attempt_group" uuid NOT NULL,
	"status" "content_job_status" DEFAULT 'queued' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"cap_minor" integer,
	"spent_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creative_renders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"creative_id" uuid NOT NULL,
	"variant" text NOT NULL,
	"storage_key" text NOT NULL,
	"media_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"ai_generated" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creatives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"pkr_id" uuid,
	"kind" "creative_kind" NOT NULL,
	"slot" text NOT NULL,
	"version" integer NOT NULL,
	"status" "creative_status" NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"duration_seconds" integer,
	"provider_job_id" text,
	"provider_status" text,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"error_message" text,
	"policy_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listing_texts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"pkr_id" uuid,
	"target" "listing_target" NOT NULL,
	"version" integer NOT NULL,
	"status" "creative_status" NOT NULL,
	"body" jsonb NOT NULL,
	"model_id" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"policy_findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pkrs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "pkr_status" DEFAULT 'generated' NOT NULL,
	"body" jsonb NOT NULL,
	"input_hash" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model_id" text NOT NULL,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "spend_cap_minor" integer;--> statement-breakpoint
CREATE INDEX "ai_calls_product_idx" ON "ai_calls" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_jobs_idempotency_uq" ON "content_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "content_jobs_one_active_uq" ON "content_jobs" USING btree ("product_id") WHERE "content_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "creative_renders_creative_variant_uq" ON "creative_renders" USING btree ("creative_id","variant");--> statement-breakpoint
CREATE UNIQUE INDEX "creatives_product_slot_version_uq" ON "creatives" USING btree ("product_id","kind","slot","version");--> statement-breakpoint
CREATE UNIQUE INDEX "creatives_provider_job_uq" ON "creatives" USING btree ("provider_job_id") WHERE "creatives"."provider_job_id" is not null;--> statement-breakpoint
CREATE INDEX "creatives_org_product_idx" ON "creatives" USING btree ("org_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listing_texts_product_target_version_uq" ON "listing_texts" USING btree ("product_id","target","version");--> statement-breakpoint
CREATE UNIQUE INDEX "pkrs_product_version_uq" ON "pkrs" USING btree ("product_id","version");