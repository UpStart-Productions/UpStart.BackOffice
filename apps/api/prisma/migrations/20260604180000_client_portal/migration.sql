-- Magic-link client portal access (no Cognito login for clients).

ALTER TABLE "Client" ADD COLUMN "portalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "portalToken" TEXT;
ALTER TABLE "Client" ADD COLUMN "portalTokenCreatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Client_portalToken_key" ON "Client"("portalToken");
