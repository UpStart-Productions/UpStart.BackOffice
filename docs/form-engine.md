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

- Module `forms`, key null, `Form.settings` = `FormSettings` (review, results email, thank-you as cleaned HTML, scoring). Public links ask name and email only; anything else is a question.
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

## Form files (Export / Import)

- `FormDefinition` (shared `forms.ts`, `format: 'ubo-form'`, `version: 1`): name, description, settings, sections with
  fields (options with points, scoreGroupId). `parseFormDefinition` checks and cleans one.
- `GET /form-admin/forms/:id/export`, `POST /form-admin/forms/import` (`{ definition, name? }`, creates a draft).
- Admin: form page ⋮ → Export form file; New form → Start from a form file (`app-single-file-dropzone`).
- Files live in `tools/forms/` (e.g. `mission-tech-compass-v2.ubo-form.json`).

## Form workspace and layouts

- `/forms/:id` and `/forms/:id/submissions` render in workspace mode: the shell (`isFormWorkspaceUrl`) reuses the Task
  Manager layout classes (`layout-task-mode`: icon rail + second column) and shows `app-form-workspace-sidebar`
  (`ui/form-workspace/`) instead of the task sidebar. `FormWorkspaceService` (core) shares the open form between the
  pages and the sidebar. The form page shows `?view=settings | scoring | links | <section id>` (default: first section);
  `app-form-builder` takes `[sectionId]` to show one section.
- Text blocks: field type `CONTENT` (migration `20261031170000_form_text_blocks`). `name` holds formatted text (Quill HTML,
  up to `FORM_CONTENT_MAX`); no answer, Required, points or score area. `questionFields()` / `isContentField()` in shared
  keep them out of answers, counts, scoring, submissions and exports; `mergeFormValues` ignores them. The builder adds them
  with **Add text**. Public pages render them (UBO's page via Angular's sanitizer, the embed script and the website through
  a safe-tag copy).
- `FormSection.description`: an optional formatted intro (Quill HTML, up to `FORM_CONTENT_MAX`), edited in the builder's
  Edit section dialog and shown under the section title. `sectionDescriptionHtml()` in shared cleans it on save and on
  read (older plain-text intros, including ones in published snapshots, become paragraphs). Form files import and export
  it as the section's `description`. On Page by question it shows above the section's first item (its own screen only
  when the section is empty). (Migration `20261031170100_section_intros_to_text_blocks` had moved the old plain-text
  intros into text blocks; those stay text blocks.)
- `FormSettings.layout`: `page | steps | questions | accordion | tabs` (default `page`). Labels: One page, Page by section
  (`steps`), Page by question (`questions`), Accordion, Tabs. Returned in `FormPublicFormDto.layout`; UBO's public page
  (`pages/forms/public-form.page.ts`) and the embed script follow it. Paged layouts put "About you" last on new-response
  links. Page by question shows one question or text block per screen with a progress bar ("Question n of N", text blocks
  not counted); a single choice moves on by itself after 350 ms. UBO's public page shows choices as a click list
  (`app-form-field-input [choices]`).
