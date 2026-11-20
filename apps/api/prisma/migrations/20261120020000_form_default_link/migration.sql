-- Each form's own public link (made automatically; can be turned off and back on).
ALTER TABLE "FormLink" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
