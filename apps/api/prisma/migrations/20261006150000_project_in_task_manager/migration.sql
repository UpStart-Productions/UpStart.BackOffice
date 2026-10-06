-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "inTaskManager" BOOLEAN NOT NULL DEFAULT false;

-- Projects that already have Task Manager data stay in the Task Manager.
UPDATE "Project" SET "inTaskManager" = true
WHERE "id" IN (SELECT DISTINCT "projectId" FROM "TaskSection")
   OR "id" IN (SELECT DISTINCT "projectId" FROM "Task");
