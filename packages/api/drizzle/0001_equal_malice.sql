-- Backfill existing rows so the new constraints hold: slugify names, fill
-- missing descriptions, and default both schemas to an unconstrained object.
UPDATE "scripts" SET "name" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'));--> statement-breakpoint
UPDATE "scripts" SET "description" = "name" WHERE "description" IS NULL OR trim("description") = '';--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "description" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "scripts" ADD COLUMN "input_schema" jsonb DEFAULT '{"type":"object"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "input_schema" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "scripts" ADD COLUMN "output_schema" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scripts" ALTER COLUMN "output_schema" DROP DEFAULT;
