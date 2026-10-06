-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('OWNER', 'EDITOR', 'COMMENTER');

-- CreateEnum
CREATE TYPE "TaskCustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "TaskCommentKind" AS ENUM ('COMMENT', 'SYSTEM');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'GUEST';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "color" TEXT,
ADD COLUMN     "importedAsanaGid" TEXT,
ALTER COLUMN "clientId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "taskId" TEXT;

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ProjectMemberRole" NOT NULL DEFAULT 'EDITOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectStar" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectStar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isCollapsed" BOOLEAN NOT NULL DEFAULT false,
    "importedAsanaGid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sectionId" TEXT,
    "parentTaskId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "dueOn" DATE,
    "dueAt" TIMESTAMP(3),
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recurrence" JSONB,
    "recurredFromId" TEXT,
    "importedAsanaGid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskFollower" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskFollower_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorLabel" TEXT,
    "kind" "TaskCommentKind" NOT NULL DEFAULT 'COMMENT',
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3),
    "importedAsanaGid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "uploadedById" TEXT,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT,
    "url" TEXT,
    "fileSize" INTEGER,
    "mimeType" TEXT,
    "importedAsanaGid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCustomField" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TaskCustomFieldType" NOT NULL,
    "options" JSONB,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "importedAsanaGid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskCustomFieldValue" (
    "taskId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskCustomFieldValue_pkey" PRIMARY KEY ("taskId","fieldId")
);

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "meta" JSONB,
    "readAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "userId" TEXT NOT NULL,
    "emailPreferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "ProjectStar_userId_idx" ON "ProjectStar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectStar_projectId_userId_key" ON "ProjectStar"("projectId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskSection_importedAsanaGid_key" ON "TaskSection"("importedAsanaGid");

-- CreateIndex
CREATE INDEX "TaskSection_projectId_sortOrder_idx" ON "TaskSection"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Task_importedAsanaGid_key" ON "Task"("importedAsanaGid");

-- CreateIndex
CREATE INDEX "Task_projectId_sectionId_sortOrder_idx" ON "Task"("projectId", "sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_parentTaskId_sortOrder_idx" ON "Task"("parentTaskId", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_assigneeId_isCompleted_dueOn_idx" ON "Task"("assigneeId", "isCompleted", "dueOn");

-- CreateIndex
CREATE INDEX "TaskFollower_userId_idx" ON "TaskFollower"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskComment_importedAsanaGid_key" ON "TaskComment"("importedAsanaGid");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAttachment_importedAsanaGid_key" ON "TaskAttachment"("importedAsanaGid");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "TaskCustomField_projectId_sortOrder_idx" ON "TaskCustomField"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TaskCustomField_projectId_importedAsanaGid_key" ON "TaskCustomField"("projectId", "importedAsanaGid");

-- CreateIndex
CREATE INDEX "TaskCustomFieldValue_fieldId_idx" ON "TaskCustomFieldValue"("fieldId");

-- CreateIndex
CREATE INDEX "UserNotification_userId_deletedAt_createdAt_idx" ON "UserNotification"("userId", "deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "UserNotification_userId_deletedAt_readAt_idx" ON "UserNotification"("userId", "deletedAt", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "Project_importedAsanaGid_key" ON "Project"("importedAsanaGid");

-- CreateIndex
CREATE INDEX "TimeEntry_taskId_idx" ON "TimeEntry"("taskId");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStar" ADD CONSTRAINT "ProjectStar_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectStar" ADD CONSTRAINT "ProjectStar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSection" ADD CONSTRAINT "TaskSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskFollower" ADD CONSTRAINT "TaskFollower_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCustomField" ADD CONSTRAINT "TaskCustomField_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCustomFieldValue" ADD CONSTRAINT "TaskCustomFieldValue_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskCustomFieldValue" ADD CONSTRAINT "TaskCustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "TaskCustomField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

