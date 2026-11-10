# Back Office Guide (Help Agent)

In-app chat assistant (“Back Office Guide” in the UI) that answers questions about UpStart Back Office from `docs/help-guide/*.md`. Open to **any signed-in back-office user** (Admin, tenant roles, tasks-only users). **Configuring** provider / model / API key is **super user only** (`RequireSuperGuard` on settings routes).

## Access

- `GET/PUT /help-agent/settings` — super user only
- `GET /help-agent/status` — `{ configured: boolean }`, any authenticated back-office user (widget gate)
- `POST /help-agent/ask` — any back-office user; system prompt includes role label (Super user, Admin, Tasks only, User) and the current page (see below)

## Name

The guide's display name is `HELP_AGENT_NAME` in `libs/shared/src/lib/help-agent.ts`. The widget, greetings, help text and API system prompt all read it. `docs/help-guide/` says "the Back Office guide" instead of the name, so renaming is a one-line change. Don't hard-code the name anywhere else.

## Context sent with each question

`POST /help-agent/ask` body (`HelpAgentAskRequest`):

- `message`: the question.
- `page` (optional): `{ route, title }`, the help drawer route pattern (e.g. `organizations/:id`) and article title from `matchHelpRoute()` in `ui/help-drawer/help-content.ts`. The widget imports that file lazily so the help content stays out of the main bundle. Added to the system prompt so "here" / "this page" means that screen.
- `history` (optional): up to `HELP_AGENT_HISTORY_LIMIT` (10) earlier messages, each clipped to 4,000 characters. Error bubbles are not sent. The API turns them into alternating provider turns (`buildTurns`).

### Privacy rule: labels and keys, never record data

- The widget sends route patterns and labels only: no record IDs, names, emails or field values.
- The API strips email addresses and phone numbers from the question and history before calling the provider (`scrubPersonalData`), as a backstop for anything typed or pasted.
- The system prompt tells the guide never to discuss specific people, organizations, contact details or record values. For a question about a specific item, it says it can't answer about that item and explains the task on the screen instead.
### Point at it (`target`)

- Target button (`pi-bullseye`) in the widget header turns on pick mode: capture-phase listeners swallow the next pointer/click outside the widget so the page doesn't react, a fixed overlay outlines the hovered control, Esc cancels. Logic: `ui/help-agent-widget/help-agent-pick.ts`.
- The clicked element becomes `target: { kind, panel?, label?, icon?, helpKey? }`: nearest control (button, link, field, heading, tab), the title of the `.card` / dialog it sits in, its `pi-*` icon, and any `app-help-text` key (`data-help-key` host attribute). Plain text with no known label picks the whole panel.
- **Allowlist:** `panel` and `label` are only filled from fixed UI labels in `HELP_AGENT_UI_LABELS` (`libs/shared/src/lib/help-agent-labels.generated.ts`, import `@upstart/back-office/shared/help-labels`, lazy-loaded in the widget). Labels built from data ("Remove " + name) never match, so that control is described by icon and panel ("Trash button · People panel"). The API filters `target` against the same list (`sanitizeTarget`) and marks it `withheld` if an unknown label slips through.
- Regenerate the list with `npm run help-labels` (also runs at the start of `npm run dev`). Commit the generated file. A stale list fails safe: new labels just fall back to panel + icon.
### Highlight (`describeSelection`)

- The widget listens to `selectionchange` (settled for 250 ms). Selections inside the widget are ignored. While the guide is open the chip updates live; a highlight made while it's closed is used if it opens within 60 s (a click elsewhere on the page drops it, a click into the widget keeps it).
- Highlighted text on the allowlist becomes `label`. Anything else sets `withheld: true` and only the panel is sent; the chip reads "Selected text not shared" (`pi-eye-slash`) and the guide opens its reply by saying it can't answer about that item, then helps with the panel.

## Reading records (data mode)

Off by default per tenant: **Settings → Back Office guide** (`OrganizationProfile.guideReadsRecords`, `GET/PUT /organization-profile/guide`, admins). When on and the provider is Anthropic:

- **Tools come from the UBO MCP server** (`UpStart.BackOffice.MCP`). `help-agent-mcp.client.ts` opens one MCP session per question at `HELP_AGENT_MCP_URL` (`localhost:8788` in dev, `mcp.heyupstart.com` in production) and forwards the asker's own `Authorization` header (Cognito ID token), `x-tenant-slug`, and in dev `x-user-email`. The MCP server acts as that user, so role and project access apply exactly as in the app.
- **Read-only allowlist** `HELP_AGENT_READ_TOOLS`: the MCP server's other tools write straight to the database, so the guide never gets them. It sees the allowlist minus whatever the MCP server hides for the person's role.
- **Loop** (`AnthropicHelpAgentProvider.generateWithTools`): up to 6 tool calls per question (`MAX_TOOL_CALLS`), then one last round with `tool_choice: none`. Assistant turns go back unchanged (thinking blocks keep their signatures). Tool results over 20,000 characters are cut.
- **Prompt:** data rules replace the guide-only "no records" rule; email/phone scrubbing is skipped (the question may name a person).
- **Off automatically** while impersonating (`x-impersonate-user-id`: the MCP server would act as the super user), for super users with no tenant, and when the MCP server is unreachable (the guide says lookups are down).
- **Usage log:** `HelpAgentUsage`, one row per question in both modes: user, model, whether it read records, tool names and arguments (never results or the question text), input/output tokens.
- **Widget:** shows "Still working on it…" after 4 s and "Looked up invoices, tasks" under answers that used records (`lookups` in the response).
- Not yet: write actions (would need confirmation cards), OpenAI/Gemini tool calling, record references from point/highlight (`data-record`), activity history, bookings, accounting and care tools.

## Guide

All `docs/help-guide/*.md` files are concatenated at ask time (sorted by filename). No vector DB. Docker image copies `docs/help-guide/` into the API container (see `api/Dockerfile`).

## Settings storage

Single row `HelpAgentSettings` with `id: "default"`. API key encrypted (`help-agent-crypto.util.ts`, repo-specific secret — rotate keys if repo access is a concern).

## Angular UI

- **Guide setup** (`/platform/help-assistant`, super users, nav **Guide setup**): provider, model, API key, Save & test connection
- **Widget** (`admin/src/app/ui/help-agent-widget/`): bottom-left sparkle avatar on every shell page when configured; not on login

## Maintenance

Update `docs/help-guide/` in the same change as any admin-visible UI change. See `.cursor/rules/docs-maintenance.mdc`.
