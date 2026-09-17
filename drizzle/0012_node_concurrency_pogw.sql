ALTER TABLE "node" ADD COLUMN IF NOT EXISTS "maxConcurrentTasks" integer DEFAULT 1 NOT NULL;
ALTER TABLE "node" ADD COLUMN IF NOT EXISTS "pogwScore" integer DEFAULT 100 NOT NULL;

UPDATE "node"
SET "maxConcurrentTasks" = LEAST(32, GREATEST(1, COALESCE(("resourcePolicy"->>'maxConcurrency')::integer, 1)))
WHERE "resourcePolicy" IS NOT NULL;
