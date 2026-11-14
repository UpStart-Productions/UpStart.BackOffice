-- Pipeline cards: estimated value and expected close date (dashboard pipeline value).
ALTER TABLE "Lead" ADD COLUMN "estimatedValue" DECIMAL(12,2),
ADD COLUMN "expectedCloseDate" TIMESTAMP(3);
