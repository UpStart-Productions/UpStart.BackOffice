-- CreateTable
CREATE TABLE "ProjectContact" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectContact_pkey" PRIMARY KEY ("id")
);

-- Migrate existing single contact fields
INSERT INTO "ProjectContact" (
    "id",
    "projectId",
    "firstName",
    "lastName",
    "phone",
    "email",
    "sortOrder",
    "updatedAt"
)
SELECT
    'pc_' || "id",
    "id",
    "contactFirstName",
    "contactLastName",
    "contactPhone",
    "contactEmail",
    0,
    CURRENT_TIMESTAMP
FROM "Project"
WHERE COALESCE("contactFirstName", '') <> ''
   OR COALESCE("contactLastName", '') <> ''
   OR COALESCE("contactPhone", '') <> ''
   OR COALESCE("contactEmail", '') <> '';

-- Drop legacy columns
ALTER TABLE "Project" DROP COLUMN "contactFirstName",
DROP COLUMN "contactLastName",
DROP COLUMN "contactPhone",
DROP COLUMN "contactEmail";

-- CreateIndex
CREATE INDEX "ProjectContact_projectId_idx" ON "ProjectContact"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectContact" ADD CONSTRAINT "ProjectContact_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
