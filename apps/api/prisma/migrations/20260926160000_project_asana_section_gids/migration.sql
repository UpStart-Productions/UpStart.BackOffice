-- AlterTable
ALTER TABLE "Project" ADD COLUMN "asanaSectionGids" JSONB;

UPDATE "Project"
SET "asanaSectionGids" = jsonb_build_array("asanaSectionGid")
WHERE "asanaSectionGid" IS NOT NULL;
