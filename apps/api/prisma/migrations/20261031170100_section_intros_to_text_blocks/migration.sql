-- Section intros become a text block at the top of their section (one way to add text to a form).
-- Plain text becomes paragraphs; blank lines start a new paragraph, single line breaks stay.
INSERT INTO "FormField" ("id", "tenantId", "sectionId", "name", "type", "required", "sortOrder", "createdAt", "updatedAt")
SELECT
  'tb' || substr(md5(s."id" || clock_timestamp()::text || random()::text), 1, 23),
  s."tenantId",
  s."id",
  '<p>' || replace(
    replace(
      replace(replace(replace(trim(s."description"), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      E'\n\n', '</p><p>'
    ),
    E'\n', '<br>'
  ) || '</p>',
  'CONTENT',
  false,
  COALESCE((SELECT MIN(f."sortOrder") FROM "FormField" f WHERE f."sectionId" = s."id"), 0) - 1,
  NOW(),
  NOW()
FROM "FormSection" s
WHERE s."description" IS NOT NULL AND trim(s."description") <> '';

UPDATE "FormSection" SET "description" = NULL WHERE "description" IS NOT NULL;
