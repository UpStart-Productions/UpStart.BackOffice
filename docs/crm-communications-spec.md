# UBO CRM & Communications — Spec (draft v0.1)

Date: 2026-10-17 · Author: Jeff + Claude · Status: draft for review, not yet sized

## 1. TL;DR

- **Goal:** let The Purple Nest (TPN) replace HubSpot (and Asana) with UBO. The make-or-break feature is a **shared communication timeline per client**: who talked to whom, when, and what the next step is.
- **Email capture:** CC the tenant's UBO address on any email to log. Reply-all keeps UBO on the thread in both directions, and UBO files it to the right Account's timeline. No mailbox connection, no mail filters, no admin rules.
- **Model:** add **Contact** (people). Promote today's **Client** into the single **Account** record (absorbing Network companies and Lead organizations). **Leads** become pipeline items attached to an Account. **Network** becomes a tag + saved view. **Tenant** is the multi-tenancy boundary.
- **Order of work:** (1) email spike, (2) tenancy + roles, (3) CRM consolidation, (4) follow-ups/notifications, (5) calendar + timesheet extras.
- **Open:** HIPAA stance, TPN's real workflow (who is invoiced, pipeline stages, people types).

## 2. Decisions made

1. Contact is a peer layer, **not** the root of projects/invoices/time. Money and work stay on Client/Account.
2. Client is promoted to the one organization-like record ("Account"). No separate Organization table.
3. Network goes away as its own concept: Network contacts = Contacts tagged "Network"; Network companies = Accounts tagged "Network"/"Partner"; the Network page becomes a saved filter.
4. v1 email capture is **capture-only** (no sending from UBO).
5. Terminology: **Tenant** = multi-tenancy boundary (UpStart, TPN). **Account** = organization/family record in the CRM.
6. Capture is by deliberate CC only (2026-10-18). Rejected: full mailbox connection (Google/Microsoft review and access), forward-everything filters (too much junk to triage), and server-side Bcc rules (nobody wants to touch Microsoft 365 / Workspace admin). Accepted trade-off: people must remember to CC; reply-all carries it from there.
7. Multi-tenancy (2026-10-23): one tenant per regular user (`User.tenantId`); no membership table. Platform operators are `User.isSuper` and switch tenants from the topbar (`x-tenant-slug` header), as in GrovLink admin. Roles are untouched for now. Isolation is enforced centrally by a Prisma extension plus an AsyncLocalStorage tenant context, not by each service (see "Tenancy" below).
8. Account journey and roles (2026-10-24): an Account has a **journey** (PROSPECT, CLIENT, PAST_CLIENT, NONE) and free-form **role tags** (Partner, Referral source, Vendor; multi-valued, so a partner can also be a client). Journey is set by hand, is reversible, and is independent of pipeline stage. "Client" means a workspace is open for the account (projects, time, invoices, portal), whether or not it is billed, so it can start at proposal time. Billing is optional: the invoice `code` is nullable and only needed once invoicing starts. Existing rows default to CLIENT; Network companies become NONE + Partner. (Rationale from HubSpot/Salesforce/Pipedrive/Zoho review: lifecycle is single-valued and separate from multi-valued type; avoid copy-on-convert, which loses data and cannot be undone.)
9. Pipeline items always belong to an Account (2026-10-24): a Lead gets an Account (reusing one with the same name, else a new Prospect) and its person becomes a Contact (`Lead.clientId`, `Lead.primaryContactId`). "Convert" no longer creates a Client; it sets the Account's journey to CLIENT. Email from a lead's people files to the Account. The Lead text columns (`primaryContact`, `email`, `phone`, `contactRole`) are a legacy mirror: the Contact is the source of truth, and the columns can be dropped once nothing reads them.
10. Network folded in (2026-10-24): `NetworkCompany` became an Account (same id) and `NetworkContact` a Contact (same id, or the existing Contact with the same email). The Network tables are left in place, unused, until a later cleanup migration. Migrations: `20261024010000_account_journey`, `20261024020000_fold_network_into_accounts`, `20261024030000_leads_belong_to_accounts`.
11. Relationship pipelines (2026-10-24): each tenant defines its own pipelines and lanes (`Pipeline`, `PipelineStage`: name, color, order). No won/lost stages and no automation: cards move by hand, a card stays on the board after its account becomes a client, and cards leave the board only when archived by hand (`Lead.archivedAt`; history kept, restorable). Cards lead with the next step (next action + date, Overdue when past) and last contact; no stale timer. Lanes are edited on the board itself (add, rename, drag to reorder, remove with move-to); anyone with Pipeline access can do it until role actions land (see claude/roles-actions-parked.md in the project). The original tenant keeps its six lanes exactly; other tenants start with New Lead, Discovery, Proposal Sent, On Hold. `Lead.stage` and `BookingType.leadStage` remain as legacy mirrors (`PipelineStage.legacyKey`) so older automations keep working. Migration `20261024040000_tenant_pipelines`.
12. Role actions and presets (2026-10-24): a role sets per area what a user can SEE (`Role.permissions`: none/own/all, unchanged) and what they can DO (`Role.actions`: create, edit, delete, setup checkboxes; missing = allowed, so existing roles kept their access). Actions apply to what the user can see; no separate own/all per action. Setup exists only for Pipeline (lanes, pipelines) and Bookings (booking types, previously admin-only). The API infers the action from the request type (GET view, POST create, PUT/PATCH edit, DELETE delete) with `@Action()` overrides (e.g. archive, Make client, file email, send invoice = edit; star/follow = view; lanes and booking types = setup). Every tenant gets the same editable built-in roles: Manager, Team member, Coordinator, Bookkeeper, Contractor, Guest (`ROLE_PRESETS` in libs/shared); reset to default, not deletable. The Network area is gone. Migration `20261024050000_role_actions_presets`.

## 3. Data model

Conventions: every table except `Tenant` has `tenantId` (added to the existing tables in phase 2, migration `20261023020000_multi_tenancy`).

Naming in the schema (phase 1): "Account" is the existing `Client` table, so foreign keys are `clientId` (not `accountId`); the pipeline item is the existing `Lead` table, so links are `leadId`. `tenantId` is injected by the Prisma extension. The schema default `''` exists only so the column is optional in TypeScript types; a missed injection fails the foreign key loudly. The original tenant is id `default`, slug `upstart`.

### Tenant and access
- `Tenant`: id, name, slug.
- `User` has `tenantId` (null only for a super user with no home tenant) and `isSuper`. Add a finance permission (flag or BILLING role; decide in phase 2) so invoices can be hidden. Existing roles ADMIN / MEMBER / CLIENT / GUEST stay; GUEST is already limited to its task projects.

### Tenancy (implemented, phase 2 part 1)
- **Enforcement:** `api/src/app/tenancy/`. A Prisma `$extends` hook (driven by Prisma's DMMF, so new models are covered automatically) adds `tenantId` to every `where`, injects it into creates (including nested creates, `connectOrCreate`, upserts, `createMany`), and strips any attempt to change it on update. A query with no tenant in context throws.
- **Context:** a global interceptor sets the tenant after the guards run. Regular user: own `tenantId` (header ignored). Super user: tenant named by `x-tenant-slug`, else their own. Service-key calls and portal sessions: the tenant their guard puts on the request. Anonymous slug routes (booking, forms): `x-tenant-slug`, else `default`. Token routes (pay, booking cancel, invites, Stripe webhook, Asana/Google OAuth callbacks) take the tenant from the row the token points to (`PublicTenantService`). Inbound email takes it from the recipient alias.
- **Escape hatch:** `runUnscoped()` for the few lookups that must see across tenants (auth user lookup, token lookups, tenant admin). Keep call sites few.
- **Per-tenant uniques:** Client.code, Account.code, Invoice.number, BankTransaction.externalId, CategorizationRule.matchKey, Tag.nameKey. Still global (to revisit): BookingType.slug, TaskForm.slug.
- **Per-tenant singletons:** Asana, Google Calendar and organization profile are one row per tenant (`tenantId` unique); service keys carry a tenant.
- **Tools:** `npm run add-tenant <slug> "<Name>" [--domains a.com]`, `npm run set-super <email>`; CLI tools take `--tenant <slug>` (default `upstart`).
- **Tests:** `api/src/app/tenancy/tenant-isolation.spec.ts` runs against a real Postgres engine (pglite) when `TENANT_TEST_SCHEMA_SQL` is set.
- **Known gaps:** a request can still name another tenant's row by id as a foreign key (ids are random cuids); uploaded files are not separated by tenant in storage; public form/booking pages for a non-default tenant need the `x-tenant-slug` header or a tenant in the URL.

### Account (today's `Client`, promoted)
- Keep the table and ids (projects, invoices, time, portal, artifacts already point at it). UI label becomes configurable ("Account"/"Client").
- `code` (invoice prefix) becomes nullable; required only once billing starts.
- Add optional network-derived fields: services, products, focus categories, isReferralReady, isPublicFeatured, publicSortOrder (kept until we confirm what, if anything, reads them).
- Relationship via tags (below), not a hard-coded type.

### Contact (new)
- `Contact`: id, tenantId, firstName, lastName, title, phone, avatarUrl, notes, isActive, lastContactAt.
- `ContactEmail`: contactId, email (unique per tenant), isPrimary. People have several addresses.
- `ContactAccount`: contactId, accountId, role (free text/enum: e.g. family member, POA, case manager, employee). Many-to-many.
- Migrates from `NetworkContact`, `Lead.primaryContact/email/phone`, and `Client.email`.

### Tags
- `Tag` (CRM): tenantId, name, color, appliesTo (CONTACT | ACCOUNT). Join tables `ContactTag`, `AccountTag`.
- Replaces `OrgCategory`. Seed for TPN from their answers; seed for UpStart from existing categories. (Separate from the existing task `Tag`.)

### Pipeline
- `Pipeline`: tenantId, name. `PipelineStage`: pipelineId, name, sortOrder, isWon, isLost.
- `Lead` evolves in place into the pipeline item: add `accountId`, `primaryContactId`, `pipelineId`, `stageId`; keep the legacy `stage` enum until backfilled. Fields kept: source, nextAction, nextActionDate, lastContactAt, serviceInterests.
- Stages seeded from the current six (New Lead, Discovery, Proposal Sent, On Hold, Active Client, Past Client).
- Moving to a "won" stage creates/links the Account (today `/leads/:id/convert` does this; drag-to-Active does not).

### Interaction (new, the timeline)
- `Interaction`: id, tenantId, type (EMAIL | CALL | MEETING | NOTE), direction (INBOUND | OUTBOUND | INTERNAL), occurredAt, subject, bodyText, bodyHtmlKey (S3), rawKey (S3), messageId (unique per tenant), threadKey, source (FORWARD | BCC | CALENDAR | MANUAL), status (FILED | UNFILED), accountId?, pipelineItemId?, loggedByUserId?.
- `InteractionParticipant`: interactionId, contactId?, userId?, email, name, role (FROM | TO | CC | BCC | ATTENDEE).
- `InteractionCapture`: interactionId, userId, capturedAt. Records who forwarded it (dedupe: one record, many capturers).
- Attachments reuse `Artifact` (FILE) with a new nullable `interactionId`.

### Capture plumbing
- `InboundAlias`: tenantId, alias (unique), isPrimary. Same pattern as GrovLink's `InboundEmailAlias` (old aliases keep routing).
- `ForwardingVerification`: aliasId, code, link, receivedAt. Holds Gmail's forwarding-confirmation message so it can be shown in Settings.

### Follow-ups and watching
- `Task` gains nullable `interactionId` and `accountId`. `Task.projectId` is required, so follow-ups live in an auto-created per-account **"Follow-ups"** project (projects already carry an optional client).
- `AccountFollow`: userId, accountId. Drives "notify me when activity is logged".
- Account and PipelineItem get/keep `nextStep`, `nextStepDate`, `lastContactAt` (auto-updated from interactions).

## 4. Email capture flow

1. Settings → Email capture shows the tenant's address (e.g. `tpn@in.<domain>`).
2. Staff CC that address on any email to log; the Email button on clients, leads and contacts opens their mail app with it pre-filled. Everyone who replies-all keeps it on. For an email received without it, reply-all and add the address (the original is kept in the quoted text). Every captured message is deliberate, so team-only notes are kept too. Replies show only their new text; the full message is one click away.
3. SES inbound receives the message, stores the raw MIME in S3, and a thin Lambda notifies the API (system-key endpoint, GrovLink pattern).
4. The API parses the message (headers incl. CC, Message-ID, In-Reply-To, References; text; HTML; attachments).
5. Dedupe on Message-ID per tenant. A second forward of the same message adds an `InteractionCapture`, not a new record.
6. Match (see 5). Create the Interaction as FILED or UNFILED.
7. Update `lastContactAt` on the Account/Contact/pipeline item; notify followers.

BCC/CC to the address takes the same path. Parsing in the API (not the Lambda) keeps raw mail for reprocessing when matching rules improve.

## 5. Matching rules

- Collect all addresses from From/To/CC. Drop internal ones (tenant users' emails and any tenant-declared internal domains).
- Look up the rest in `ContactEmail`.
  - One Account across matched contacts → FILED to it.
  - No match → create a Contact from the sender/recipient, mark UNFILED.
  - Several Accounts → UNFILED for manual choice.
- Filing manually can create the Contact and optionally a rule ("always file this address to X").
- Thread by References/In-Reply-To; fall back to normalized subject + participants.
- Display: strip quoted replies by default, show text view first, sanitize any HTML.

## 6. Screens

- **Account page** (today's client page): new Activity tab (timeline, threads, search), Contacts section, Follow button, next step / last contacted.
- **Pipeline board**: cards show days since last contact, next step, overdue/stale badge; stage columns come from `PipelineStage`.
- **Contacts & Accounts directory**: replaces Network; filter by tag; saved views ("Network").
- **Unfiled inbox**: assign to an Account, create/merge contact, dismiss.
- **Settings → Email capture**: address, filter instructions, verification codes.
- **Dashboard widgets**: "Needs follow-up", "Recent client activity".
- **Global search**: add contacts and interactions (Postgres full-text on subject + body is enough at this scale).
- **Manual log**: call and note forms.

## 7. Phases

| Phase | Scope | Done when |
|---|---|---|
| 1. Email spike | `Tenant` stub, Contact + ContactEmail, Interaction, InboundAlias, SES inbound → parse → match → Activity tab on Account, Unfiled inbox, Settings page. Uses existing Client as the Account. | Forward an email to the alias and see it on the right account's timeline. Demo to TPN. |
| 2. Tenancy + roles | **Tenancy done (2026-10-23, pending local test and prod migration):** `tenantId` on all tables, enforced centrally by a Prisma extension, per-tenant singletons, super-user tenant switcher. **Still to do:** finance permission, 2FA via Cognito for admins. | TPN and UpStart run side by side with no data leakage; guests can't see invoices. |
| 3. CRM consolidation | Fold Network/Lead orgs into Account, tags, configurable pipelines/stages, Contacts on leads, drag-to-won creates the Account. | One directory and one pipeline model; Network is a tag + view. |
| 4. Follow-ups and watching | Tasks from interactions, next step, `AccountFollow`, `client_activity` notifications, dashboard widgets, stale-client alerts. Digests need a scheduled job. | A partner not on a thread sees the activity. |
| 5. Calendar and invoicing extras | Per-tenant/per-user calendar connection, meetings logged as interactions, calendar → timesheet suggestions, per-person breakdown on invoices (internal), QuickBooks-friendly totals. | Meetings appear automatically; invoice shows who contributed what. |
| Later | Send from UBO, portal messaging, SMS, open/click tracking, sequences. | — |

Sizing: not done. From the 10/14 meeting, Jeff's own estimate for tenancy + roles was "a couple of weeks".

TPN needs phases 1, 2 and the tag/stage part of 3 before go-live.

## 8. Migration notes (UpStart's own data)

- `NetworkCompany` → Account (tag Network/Partner). `NetworkContact` → Contact (tag Network).
- `Lead.organization` → Account (tag Prospect) unless it already converted; `Lead` keeps its row and gains the links.
- `OrgCategory` values → tags.
- `Artifact` links (`leadId`, `networkCompanyId`, `networkContactId`) collapse toward `accountId` / `contactId`.
- Keep working through the change: booking → lead creation, lead ingest, and the leads-automation endpoints (new-leads, research-note).

## 9. Open questions

**For TPN (add to Lori's punch-list reply)**
- Who gets invoiced: a family member, the individual, or an agency?
- What kinds of people do you track (families, referral sources, agencies, caregivers, vendors)?
- What are the steps from first inquiry to active family (pipeline stages)?
- Who needs to see invoicing? Who is a guest?
- Which email addresses/domains do partners use (not all are @thepurplenest)?

**For Jeff**
- HIPAA stance: accept PHI (AWS BAA, audit log, 2FA, your liability) or contractually exclude it. Message bodies and pipeline notes may describe a person's health situation.
- Inbound domain for UBO (new MX + SES verification) or reuse GrovLink's.
- Where is the GrovLink SES-receiving Lambda? (Not in the repo.)
- What, if anything, reads the Network public-site fields?
- Is there a scheduler for digests/stale alerts?
- Production DB is Docker Postgres on EC2: confirm backups before real client data.
- Pricing/commercial model for TPN (not discussed yet).

## 10. To verify before building

- SES inbound availability in the region used (UBO defaults to us-west-2).
- Gmail forwarding-address confirmation mechanics (whether the code/link can be reliably extracted).
- Whether forwarded mail preserves original headers well enough for matching in all cases.
- Whether the capture filter approach is acceptable to TPN's partners on mixed domains.
- Habit risk: will TPN reliably CC UBO on the first message of a thread? The model depends on it.

## 11. Out of scope for v1

Open/click tracking, sequences/templates, sending from UBO, HubSpot-style marketing automation, a mobile app, a HIPAA compliance program (separate decision).
