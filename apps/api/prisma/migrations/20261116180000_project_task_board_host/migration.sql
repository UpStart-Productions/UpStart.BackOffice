-- AlterTable
ALTER TABLE "Project" ADD COLUMN "taskBoardHostId" TEXT;

-- CreateIndex
CREATE INDEX "Project_taskBoardHostId_idx" ON "Project"("taskBoardHostId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_taskBoardHostId_fkey" FOREIGN KEY ("taskBoardHostId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;