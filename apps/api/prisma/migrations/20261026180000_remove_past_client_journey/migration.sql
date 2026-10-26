-- Past client status is removed. Those organizations become clients marked inactive.
UPDATE "Client"
SET "journey" = 'CLIENT', "isActive" = false
WHERE "journey" = 'PAST_CLIENT';

UPDATE "Lead"
SET "stage" = 'ON_HOLD'
WHERE "stage" IN ('PAST_CLIENT', 'ACTIVE_CLIENT');

UPDATE "BookingType"
SET "leadStage" = 'DISCOVERY'
WHERE "leadStage" IN ('PAST_CLIENT', 'ACTIVE_CLIENT');

UPDATE "PipelineStage"
SET "legacyKey" = NULL
WHERE "legacyKey" IN ('PAST_CLIENT', 'ACTIVE_CLIENT');

ALTER TYPE "AccountJourney" RENAME TO "AccountJourney_old";
CREATE TYPE "AccountJourney" AS ENUM ('PROSPECT', 'CLIENT', 'NONE');
ALTER TABLE "Client" ALTER COLUMN "journey" DROP DEFAULT;
ALTER TABLE "Client"
  ALTER COLUMN "journey" TYPE "AccountJourney"
  USING ("journey"::text::"AccountJourney");
ALTER TABLE "Client" ALTER COLUMN "journey" SET DEFAULT 'CLIENT'::"AccountJourney";
DROP TYPE "AccountJourney_old";

ALTER TYPE "LeadStage" RENAME TO "LeadStage_old";
CREATE TYPE "LeadStage" AS ENUM ('NEW_LEAD', 'DISCOVERY', 'PROPOSAL_SENT', 'ON_HOLD');
ALTER TABLE "Lead" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "Lead"
  ALTER COLUMN "stage" TYPE "LeadStage"
  USING ("stage"::text::"LeadStage");
ALTER TABLE "Lead" ALTER COLUMN "stage" SET DEFAULT 'NEW_LEAD'::"LeadStage";
ALTER TABLE "BookingType" ALTER COLUMN "leadStage" DROP DEFAULT;
ALTER TABLE "BookingType"
  ALTER COLUMN "leadStage" TYPE "LeadStage"
  USING ("leadStage"::text::"LeadStage");
ALTER TABLE "BookingType" ALTER COLUMN "leadStage" SET DEFAULT 'DISCOVERY'::"LeadStage";
ALTER TABLE "PipelineStage"
  ALTER COLUMN "legacyKey" TYPE "LeadStage"
  USING ("legacyKey"::text::"LeadStage");
DROP TYPE "LeadStage_old";
