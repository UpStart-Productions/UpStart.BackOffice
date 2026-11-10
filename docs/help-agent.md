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
- Planned: "point at it" mode (pick a panel or highlight a label for context). Only text matching known UI labels (panel titles, `data-help-context` anchors, help-text keys) will be sent; anything else is treated as record data, never sent, and the widget replies locally that it can't answer about that item.

## Guide

All `docs/help-guide/*.md` files are concatenated at ask time (sorted by filename). No vector DB. Docker image copies `docs/help-guide/` into the API container (see `api/Dockerfile`).

## Settings storage

Single row `HelpAgentSettings` with `id: "default"`. API key encrypted (`help-agent-crypto.util.ts`, repo-specific secret — rotate keys if repo access is a concern).

## Angular UI

- **Guide setup** (`/platform/help-assistant`, super users, nav **Guide setup**): provider, model, API key, Save & test connection
- **Widget** (`admin/src/app/ui/help-agent-widget/`): bottom-left sparkle avatar on every shell page when configured; not on login

## Maintenance

Update `docs/help-guide/` in the same change as any admin-visible UI change. See `.cursor/rules/docs-maintenance.mdc`.
