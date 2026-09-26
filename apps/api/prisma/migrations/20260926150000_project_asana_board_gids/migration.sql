-- AlterTable
ALTER TABLE "Project" ADD COLUMN "asanaProjectGids" JSONB;

UPDATE "Project"
SET "asanaProjectGids" = jsonb_build_array("asanaProjectGid")
WHERE "asanaProjectGid" IS NOT NULL;
