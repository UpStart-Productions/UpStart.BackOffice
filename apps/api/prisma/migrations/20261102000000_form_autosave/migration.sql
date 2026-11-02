-- Forms auto-save: a response is In progress until it is submitted (submittedAt). Public new-response drafts keep
-- saving with a token the browser holds (hash stored). Client share links can fill in one specific result.

ALTER TABLE "FormResponse" ADD COLUMN "submittedAt" TIMESTAMP(3);
ALTER TABLE "FormResponse" ADD COLUMN "draftTokenHash" TEXT;
CREATE UNIQUE INDEX "FormResponse_draftTokenHash_key" ON "FormResponse"("draftTokenHash");

-- Everything already there counts as submitted.
UPDATE "FormResponse" SET "submittedAt" = "createdAt";

ALTER TABLE "FormLink" ADD COLUMN "responseId" TEXT;
CREATE INDEX "FormLink_responseId_idx" ON "FormLink"("responseId");
ALTER TABLE "FormLink" ADD CONSTRAINT "FormLink_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "FormResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
