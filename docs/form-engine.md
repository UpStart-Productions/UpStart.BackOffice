# Form engine

Forms are core in UBO, like Time and Tasks. One engine and one builder serve every form. Modules that need
forms (Care today, the Forms area next) own their forms and decide what happens with responses.

## Tables

| Table | What it holds |
|---|---|
| `Form` | `module` (owner, e.g. `care`; `forms` for free-standing forms) + `key` (the module's name for it, e.g. `INTAKE`; null for free-standing), name, description, per-role access |
| `FormSection`, `FormField` | Structure. Field values are keyed by field id; select values store option ids |
| `FormVersion` | Publish freezes the form (`FormSnapshot`: name, description, sections with option points, scoring). `Form.publishedVersionId` is what public links serve; module forms without one serve live fields |
| `FormResponse` | Answers (`values`), status (`PENDING` from a public link, `ACTIVE`, `DISMISSED`), submitter (incl. organization), optional `clientId`, `versionId`, `scores`, `resultToken`, `living` |
| `FormLink`, `FormLinkAccess` | Public links (`NEW` = anyone can send a new response, `CLIENT` = one organization's response) and their passcode / emailed-code verifications |

Migration `20261030003000_form_engine` renamed the Care tables (`CareForm` etc.) in place; ids are unchanged.
Migration `20261030120000_forms_area` added versions, settings and scoring. Care's one-copy-per-organization rule is a
partial unique index on `FormResponse(formId, clientId) WHERE living` (Care sets `living: true`).
Care's visit checklist answers stay on `CareVisit.values`, keyed by the Visit log form's field ids.

## Builder profiles (hard rule)

`FORM_PROFILES` in `libs/shared/src/lib/forms.ts`, keyed `module:key`, says what a form can have: field types,
Required, new-response links, organization links. Free-standing forms get everything. The admin builder
(`app-form-builder`, `admin/src/app/ui/form-builder/`) shows only what the profile allows, and the API
(`FormStructureService`, `FormLinksService`) refuses anything else. New engine features (scoring, pages,
logic) are added to the profile type and switched on per profile.

## API (`api/src/app/forms/`)

- `FormStructureService`: sections and fields, value counts, moving. Callers pass the module they own, so a
  module can't change another module's forms. Permission checks are the caller's.
- `FormLinksService`: make, list, revoke links (profile-checked).
- `FormPublicService` / `FormPublicController` (`/form-links/:token`, also `/care-links/:token`; header
  `X-Form-Access`, also `X-Care-Access`): link lookup, passcode, emailed code, rate limits, honeypot, checking answers.
- `FormDestinations`: each module registers a `FormDestination` (`storedValues`, `submit`, `tenantModule`).
  The engine checks answers; the destination decides where they go. Care's is `care/care-destination.ts`.

## Adding forms to a module

1. Add the module's profiles to `FORM_PROFILES`.
2. Create its forms with `module` = the module name and a `key` per form.
3. Call `FormStructureService` from the module's own controllers (its permission checks), and put
   `app-form-builder` on its setup page with `[profile]` and `apiBase`.
4. If it has public links, register a destination.

## Forms area (free-standing forms)

- Module `forms`, key null, `Form.settings` = `FormSettings` (review, ask organization/phone, results email, thank-you, CTA, scoring).
- Area `forms` (core, ownable: Own = `createdById`). API `FreeFormsController` at `/form-admin/...` (`/forms` is taken by Task Forms).
- Scoring: `computeFormScores` (shared) on submit against the published snapshot; `publicSections` strips points before
  anything goes to a public page. Bands are picked by `upTo` (percent, inclusive); the last band catches the rest.
- `FreeFormDestination`: saves the submission (PENDING when Review is on), notifies (`form_submission`), emails results via SES,
  returns a `resultToken` for scored forms. `GET /form-results/:token` (`FormResultsController`) returns `FormResultDto`.
- Admin: `/forms`, `/forms/:id`, `/forms/:id/submissions`, `/forms/submissions/:id`; public page `/form/:token`
  (same component as `/care-form/:token`). Shared UI: `app-form-builder`, `app-form-links`, `app-accept-response-dialog`.
- Host sites (e.g. heyupstart.com) call `/form-links/:token`, `/form-links/:token/form`, `/form-links/:token/submit`
  and `/form-results/:token` directly and render with their own branding. Their origin must be allowed by CORS.

## Putting forms on other websites

- **Embed script:** `GET /api/form-embed.js` (`FormEmbedController`, source in `forms/form-embed.script.ts`, plain browser JS).
  `<script src="{api}/form-embed.js" data-ubo-form="{link token}" async></script>` draws the form inside the host page
  with the host's fonts; CSS variables on `.ubo-form` tune it. Optional `data-target`, `data-redirect` (`{token}` =
  result token), events `ubo-form:ready` / `ubo-form:submitted`. Links that need a passcode or emailed code show an
  "Open the form" button to UBO's page (`pageUrl`).
- **Headless:** a site's own code calls `/form-links/:token`, `/form-links/:token/form`, `/form-links/:token/submit`
  and `/form-results/:token` (heyupstart.com's `/compass-test/` does this).
- **CORS:** only these public form paths answer any website (`forms/public-forms-cors.ts`, wired in `main.ts`: no
  credentials). Everything else keeps the app's CORS_ORIGINS rules.
- **Allowed websites:** `FormLink.allowedOrigins` (migration `20261030150000_form_link_websites`). Empty = any website.
  `FormPublicService` refuses browser requests (Origin header) from other websites with 403. UBO's own page is always
  allowed; requests without an Origin (server-to-server) aren't website requests and pass. This stops other sites from
  showing a form; rate limits, the honeypot and review cover abuse.
- Admin: links panel ⋮ → **Embed on a website** (embed code, link key, allowed websites; `PATCH {apiBase}/links/:id`).
