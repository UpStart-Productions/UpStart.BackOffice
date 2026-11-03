/**
 * Lead -> Account/Contact linking against a real Postgres engine (pglite), through the real tenant
 * extension. Skipped unless pglite is installed and TENANT_TEST_SCHEMA_SQL points at the schema:
 *   npx prisma migrate diff --from-empty --to-schema apps/api/prisma/schema.prisma --script > /tmp/schema.sql
 *   TENANT_TEST_SCHEMA_SQL=/tmp/schema.sql npx vitest run --root api lead-links.db
 *
 * Legacy ensureLeadLinks tests removed — pipeline cards no longer auto-create organizations on save.
 */
import { describe } from 'vitest';

describe.skip('lead links (real Postgres)', () => {
  /* TODO: promote + applyLeadEditsToLinks integration tests when pglite harness is updated */
});
