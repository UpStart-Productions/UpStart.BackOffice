# Help drawer, Contact Support, and field tooltips

Ported from GrovLink (`Nonprofit.Mobile.Platform/admin/src/app/ui/help-drawer`). Three pieces, separate from the Back Office Guide chat (`docs/help-agent.md`).

## Help drawer

- **Open:** `?` button in the top bar (`layout/app-topbar.component.ts`). The drawer is `@defer`-loaded on first click so its content stays out of the main bundle.
- **Component:** `ui/help-drawer/help-drawer.component.ts`. PrimeNG `p-drawer` appended to body, right side, 26.5rem wide, non-modal overlay (no page shift). Starts below the fixed 4.5rem top bar. Its host takes no space in the top bar so icon spacing is unchanged.
- **Content:** `ui/help-drawer/help-content.ts`. `HELP_CONTENT` keyed by route pattern (`pipeline/:id`, `tasks/projects/:projectId/forms`). `getHelpArticle()` picks the most specific match (literal segments beat `:params`), then falls back to parent routes. Query strings are ignored. No match shows a "How can we help?" fallback.
- Updates the article on navigation while open.

## Contact Support

- **UI:** `ui/support-feedback-modal/` — topics (checkboxes) + message. Opened from the drawer footer.
- **API:** `POST /support/feedback` (`api/src/app/support/`), any back-office user. Validates `SubmitSupportFeedbackDto` (topic ids from `libs/shared/src/lib/support-feedback.ts`).
- **Delivery:** emails `SUPPORT_INBOX_EMAIL` (`support@heyupstart.com`, constant in `support.service.ts`) via SES with **Reply-To set to the user**, so replying from the support inbox goes straight to them. Includes tenant, user, role, impersonator (if any), page URL, browser and client environment.
- Not stored in the database (GrovLink stores rows and has a super-user inbox; not ported). If SES fails the user sees an error telling them to email support directly.

## Field tooltips

- `<app-help-text key="area.field" />` (`ui/help-text/help-text.component.ts`) renders a ⓘ with a PrimeNG tooltip; renders nothing for an unknown key.
- Text lives in `core/help-text.registry.ts`, read through `HelpTextService`.
- Use for fields that need a one-line explanation and don't already have a hint under them.
