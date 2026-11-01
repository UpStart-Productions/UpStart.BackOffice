-- Care's Intake form, Care profile and Visit log become ordinary forms in Forms (module "forms").
-- Ids are kept, so answers, share links and visit checklist answers (keyed by field id) carry over.
-- Intake: a client form, a new result each time, public links can create clients (category Intake).
-- Care profile: a client form, one living copy per client (category Care profile).
-- Visit log: the visit checklist.
-- Their public links serve the published version from now on: publish each form once in Forms.

UPDATE "Form"
SET "settings" = COALESCE("settings", '{}'::jsonb) || jsonb_build_object(
      'review', true,
      'askPhone', true,
      'client', jsonb_build_object('enabled', true, 'copies', 'each', 'createClients', true, 'category', 'Intake')
    )
WHERE "module" = 'care' AND "key" = 'INTAKE';

UPDATE "Form"
SET "settings" = COALESCE("settings", '{}'::jsonb) || jsonb_build_object(
      'client', jsonb_build_object('enabled', true, 'copies', 'living', 'createClients', false, 'category', 'Care profile')
    )
WHERE "module" = 'care' AND "key" = 'CARE_PROFILE';

UPDATE "Form"
SET "settings" = COALESCE("settings", '{}'::jsonb) || jsonb_build_object('visitChecklist', true)
WHERE "module" = 'care' AND "key" = 'VISIT';

-- Intake results are dated submissions now, not living copies.
UPDATE "FormResponse" r SET "living" = false
FROM "Form" f
WHERE f."id" = r."formId" AND f."module" = 'care' AND f."key" = 'INTAKE';

UPDATE "Form" SET "module" = 'forms', "key" = NULL WHERE "module" = 'care';
