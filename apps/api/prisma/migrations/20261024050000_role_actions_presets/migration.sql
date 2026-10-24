-- Role actions: what a role may DO per area (create, edit, delete, setup checkboxes) on top of what it may SEE.
-- Existing roles get {} = everything allowed within what they can see, so nobody's access changes.
-- Every tenant gets the same preset roles (editable). A preset is skipped where the tenant already has
-- a role with that key or name. The Guest role already exists.

ALTER TABLE "Role" ADD COLUMN "actions" JSONB NOT NULL DEFAULT '{}';

WITH presets(key, name, permissions, actions) AS (
  VALUES
    ('manager', 'Manager', '{"clients":"all","contacts":"all","pipeline":"all","bookings":"all","inbox":"all","projects":"all","tasks":"all","time":"all","expenses":"all","invoices":"all","reports":"all"}'::jsonb, '{"clients":{"create":true,"edit":true,"delete":true},"contacts":{"create":true,"edit":true,"delete":true},"pipeline":{"create":true,"edit":true,"delete":true,"setup":true},"bookings":{"create":true,"edit":true,"delete":true,"setup":true},"inbox":{"create":true,"edit":true,"delete":true},"projects":{"create":true,"edit":true,"delete":true},"tasks":{"create":true,"edit":true,"delete":true},"time":{"create":true,"edit":true,"delete":true},"expenses":{"create":true,"edit":true,"delete":true},"invoices":{"create":true,"edit":true,"delete":true}}'::jsonb),
    ('team-member', 'Team member', '{"clients":"all","contacts":"all","pipeline":"all","bookings":"all","inbox":"all","projects":"own","tasks":"own","time":"own","expenses":"own"}'::jsonb, '{"clients":{"create":true,"edit":true,"delete":false},"contacts":{"create":true,"edit":true,"delete":false},"pipeline":{"create":true,"edit":true,"delete":false,"setup":false},"bookings":{"create":true,"edit":true,"delete":false,"setup":false},"inbox":{"create":true,"edit":true,"delete":false},"projects":{"create":true,"edit":true,"delete":true},"tasks":{"create":true,"edit":true,"delete":true},"time":{"create":true,"edit":true,"delete":true},"expenses":{"create":true,"edit":true,"delete":true}}'::jsonb),
    ('coordinator', 'Coordinator', '{"inbox":"all","contacts":"all","pipeline":"all","bookings":"all","clients":"all"}'::jsonb, '{"inbox":{"create":true,"edit":true,"delete":false},"contacts":{"create":true,"edit":true,"delete":false},"pipeline":{"create":true,"edit":true,"delete":false,"setup":false},"bookings":{"create":true,"edit":true,"delete":false,"setup":false},"clients":{"create":false,"edit":true,"delete":false}}'::jsonb),
    ('bookkeeper', 'Bookkeeper', '{"invoices":"all","reports":"all","time":"all","expenses":"all","clients":"all"}'::jsonb, '{"invoices":{"create":true,"edit":true,"delete":true},"time":{"create":false,"edit":false,"delete":false},"expenses":{"create":false,"edit":false,"delete":false},"clients":{"create":false,"edit":false,"delete":false}}'::jsonb),
    ('contractor', 'Contractor', '{"projects":"own","tasks":"own","time":"own","expenses":"own"}'::jsonb, '{"projects":{"create":false,"edit":true,"delete":false},"tasks":{"create":true,"edit":true,"delete":true},"time":{"create":true,"edit":true,"delete":true},"expenses":{"create":true,"edit":true,"delete":true}}'::jsonb)
)
INSERT INTO "Role" ("id", "tenantId", "name", "key", "permissions", "actions", "updatedAt")
SELECT p.key || '-' || t."id", t."id", p.name, p.key, p.permissions, p.actions, CURRENT_TIMESTAMP
FROM "Tenant" t CROSS JOIN presets p
WHERE NOT EXISTS (
  SELECT 1 FROM "Role" r WHERE r."tenantId" = t."id" AND (r."key" = p.key OR lower(r."name") = lower(p.name))
);

-- Guest: make its actions explicit (same access as before).
UPDATE "Role" SET "actions" = '{"tasks":{"create":true,"edit":true,"delete":true}}' WHERE "key" = 'guest' AND "actions" = '{}';
