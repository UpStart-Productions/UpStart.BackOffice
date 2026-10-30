-- Form links: the websites allowed to show the form (embeds). Empty = any website.
-- AlterTable
ALTER TABLE "FormLink" ADD COLUMN     "allowedOrigins" TEXT[] DEFAULT ARRAY[]::TEXT[];

