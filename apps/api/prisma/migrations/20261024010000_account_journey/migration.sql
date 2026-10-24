-- CreateEnum
CREATE TYPE "AccountJourney" AS ENUM ('PROSPECT', 'CLIENT', 'PAST_CLIENT', 'NONE');

-- AlterTable: existing rows are all clients today (default CLIENT backfills them).
ALTER TABLE "Client"
  ADD COLUMN "journey" "AccountJourney" NOT NULL DEFAULT 'CLIENT',
  ADD COLUMN "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "code" DROP NOT NULL;
