-- CreateEnum
CREATE TYPE "TaskFormAccess" AS ENUM ('OPEN', 'COLLABORATORS', 'API_KEY');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "formId" TEXT,
ADD COLUMN     "submitterEmail" TEXT,
ADD COLUMN     "submitterName" TEXT;

-- CreateTable
CREATE TABLE "TaskForm" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "access" "TaskFormAccess" NOT NULL DEFAULT 'COLLABORATORS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sectionId" TEXT,
    "assigneeId" TEXT,
    "tagIds" JSONB,
    "questions" JSONB NOT NULL,
    "confirmationMessage" TEXT,
    "apiKeyHash" TEXT,
    "apiKeyHint" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskForm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskForm_slug_key" ON "TaskForm"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TaskForm_apiKeyHash_key" ON "TaskForm"("apiKeyHash");

-- CreateIndex
CREATE INDEX "TaskForm_projectId_idx" ON "TaskForm"("projectId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_formId_fkey" FOREIGN KEY ("formId") REFERENCES "TaskForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskForm" ADD CONSTRAINT "TaskForm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskForm" ADD CONSTRAINT "TaskForm_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskForm" ADD CONSTRAINT "TaskForm_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskForm" ADD CONSTRAINT "TaskForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

