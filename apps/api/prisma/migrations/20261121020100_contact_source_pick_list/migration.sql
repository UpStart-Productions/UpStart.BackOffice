-- Contact source becomes free text from the Contact sources pick list (was a fixed enum). Codes become labels.
ALTER TABLE "Lead" ALTER COLUMN "source" TYPE TEXT USING (
  CASE "source"::text
    WHEN 'WARM_OUTREACH' THEN 'Warm Outreach'
    WHEN 'REFERRAL' THEN 'Referral'
    WHEN 'INBOUND' THEN 'Inbound'
    WHEN 'EVENT' THEN 'Event'
    WHEN 'SOCIAL' THEN 'Social'
    WHEN 'COLD_OUTREACH' THEN 'Cold Outreach'
    ELSE "source"::text
  END
);

ALTER TABLE "BookingType" ALTER COLUMN "leadSource" DROP DEFAULT;
ALTER TABLE "BookingType" ALTER COLUMN "leadSource" TYPE TEXT USING (
  CASE "leadSource"::text
    WHEN 'WARM_OUTREACH' THEN 'Warm Outreach'
    WHEN 'REFERRAL' THEN 'Referral'
    WHEN 'INBOUND' THEN 'Inbound'
    WHEN 'EVENT' THEN 'Event'
    WHEN 'SOCIAL' THEN 'Social'
    WHEN 'COLD_OUTREACH' THEN 'Cold Outreach'
    ELSE "leadSource"::text
  END
);
ALTER TABLE "BookingType" ALTER COLUMN "leadSource" SET DEFAULT 'Inbound';

DROP TYPE "LeadSource";

-- Pipeline card categories use the Focus areas pick list's labels (were codes like RECOVERY).
UPDATE "Lead" SET "category" = CASE "category"
    WHEN 'RECOVERY' THEN 'Recovery'
    WHEN 'FAMILY' THEN 'Family'
    WHEN 'YOUTH' THEN 'Youth'
    WHEN 'FAITH' THEN 'Faith'
    WHEN 'HEALTH' THEN 'Health'
    WHEN 'DISABILITY' THEN 'Disability'
    WHEN 'EDUCATION' THEN 'Education'
    WHEN 'JOBS_WORKFORCE' THEN 'Jobs / Workforce'
    WHEN 'PETS' THEN 'Pets'
    WHEN 'FUNDING' THEN 'Funding'
    WHEN 'HUNGER' THEN 'Hunger'
    WHEN 'VIOLENCE' THEN 'Violence'
    WHEN 'ACTIVITIES' THEN 'Activities'
    WHEN 'OTHER' THEN 'Other'
    ELSE "category"
  END
WHERE "category" IS NOT NULL;
