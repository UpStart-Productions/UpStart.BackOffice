-- AlterTable
ALTER TABLE "DimensionDefinition" ADD COLUMN "catalogExcluded" TEXT[] DEFAULT ARRAY[]::TEXT[];
