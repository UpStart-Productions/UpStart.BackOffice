-- CreateTable
CREATE TABLE "TimeEntryWorkTask" (
    "timeEntryId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TimeEntryWorkTask_pkey" PRIMARY KEY ("timeEntryId","taskId")
);

-- CreateIndex
CREATE INDEX "TimeEntryWorkTask_taskId_idx" ON "TimeEntryWorkTask"("taskId");

-- AddForeignKey
ALTER TABLE "TimeEntryWorkTask" ADD CONSTRAINT "TimeEntryWorkTask_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntryWorkTask" ADD CONSTRAINT "TimeEntryWorkTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy single taskId
INSERT INTO "TimeEntryWorkTask" ("timeEntryId", "taskId", "sortOrder")
SELECT "id", "taskId", 0
FROM "TimeEntry"
WHERE "taskId" IS NOT NULL
ON CONFLICT DO NOTHING;
