# Back Office Guide (Help Agent)

In-app chat assistant (“Back Office Guide” in the UI) that answers questions about UpStart Back Office from `docs/help-guide/*.md`. Open to **any signed-in back-office user** (Admin, tenant roles, tasks-only users). **Configuring** provider / model / API key is **super user only** (`RequireSuperGuard` on settings routes).

## Access

- `GET/PUT /help-agent/settings` — super user only
- `GET /help-agent/status` — `{ configured: boolean }`, any authenticated back-office user (widget gate)
- `POST /help-agent/ask` — any back-office user; system prompt includes role label (Super user, Admin, Tasks only, User)

## Guide

All `docs/help-guide/*.md` files are concatenated at ask time (sorted by filename). No vector DB. Docker image copies `docs/help-guide/` into the API container (see `api/Dockerfile`).

## Settings storage

Single row `HelpAgentSettings` with `id: "default"`. API key encrypted (`help-agent-crypto.util.ts`, repo-specific secret — rotate keys if repo access is a concern).

## Angular UI

- **Guide setup** (`/platform/help-assistant`, super users, nav **Guide setup**): provider, model, API key, Save & test connection
- **Widget** (`admin/src/app/ui/help-agent-widget/`): bottom-left sparkle avatar on every shell page when configured; not on login

## Maintenance

Update `docs/help-guide/` in the same change as any admin-visible UI change. See `.cursor/rules/docs-maintenance.mdc`.
