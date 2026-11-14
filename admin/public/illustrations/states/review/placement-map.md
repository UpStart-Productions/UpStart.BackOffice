# Screen-to-artwork map

This maps the source inventory reviewed in the chat to the reusable candidate library. All new art is pending review. Filenames below refer to `assets/`; replace with `static/` for unconditional stills. Add `-compact` before `.svg` for the small composition.

## Main screens

| Location / condition | Artwork | Size / behavior |
|---|---|---|
| Invoices: no invoices yet | Parent approved `empty-invoices.svg` + parent approved motion | Preserve approved rising-page and individual detail sequence |
| Accounts, including Client-filtered views: no accounts | `empty-accounts.svg` | Large first-use; compact in a related-record panel |
| People: no people | `empty-people.svg` | Large |
| Projects: none or none active | `empty-projects.svg` | Large; keep the “Show inactive” recovery option when applicable |
| Tasks project browser / sidebar: no projects | `empty-projects.svg` | Large browser; compact sidebar |
| My Tasks: no assignments | `empty-tasks.svg` | Large |
| Project task list / board: no tasks | `empty-tasks.svg` | One main illustration, not one per lane |
| Empty individual task section / board lane | `empty-tasks-compact.svg` | Optional compact prompt; retain Add task / drop controls |
| Pipeline: entire board empty | `empty-pipeline.svg` | One board-level illustration |
| Pipeline: one empty lane | None | Keep a quiet text drop target; avoid repeating art in each column |
| Time tracking: no entries for selected day | `empty-time.svg` | Large / medium, with Track time action |
| Expenses: no expenses in period | `empty-expenses.svg` | Large / medium |
| Bookings: no bookings / none for selected type | `empty-bookings.svg` | Large / medium; explain selected-type context |
| Booking types: no types configured | `empty-booking-types.svg` | Large / medium |
| Forms directory: none | `empty-forms.svg` | Large |
| Task intake forms: none | `empty-forms.svg` | Reuse |
| Form submissions: no responses received | `empty-form-submissions.svg` | Large / medium |
| Accounting journal: no entries | `empty-ledger.svg` | Large / medium |
| Chart of accounts: none | `empty-ledger.svg` | Reuse, with chart-of-accounts copy |
| Bank import: no transactions | `empty-bank-transactions.svg` | Large / medium with Import CSV action |

## Activity and completion

| Location / condition | Artwork |
|---|---|
| Activity Unfiled: nothing to file | `empty-inbox.svg` |
| Tasks Inbox: all caught up | `empty-all-caught-up.svg` |
| Activity form review: nothing pending | `empty-all-caught-up.svg` |
| Other Activity to-do queues: clear | `empty-all-caught-up.svg` |
| My Tasks Today: nothing due | `empty-all-caught-up-compact.svg` |
| People Review: nothing needs review | `empty-all-caught-up.svg` or compact according to available space |
| Notification dropdown: no unread items | `empty-notifications-compact.svg` |
| Account / person timeline: no recorded activity | `empty-activity.svg` or compact |

## Dashboard: use compact artwork or the existing quiet chart treatment

| Panel / condition | Artwork |
|---|---|
| Financial health: brand-new workspace | `empty-reports-compact.svg` |
| Financial health: nothing overdue / unbilled / in drafts | `empty-all-caught-up-compact.svg` |
| Today: no tasks due | `empty-all-caught-up-compact.svg` |
| My work: no assignments | `empty-tasks-compact.svg` |
| Pipeline & relationships: no records / suggestions | `empty-pipeline-compact.svg` / `empty-activity-compact.svg` |
| Since last time: no recent activity | `empty-activity-compact.svg` |
| My time: nothing logged | `empty-time-compact.svg` |
| My shifts: none upcoming | `empty-schedule-compact.svg` |
| Account unbilled-work detail: nothing unbilled | `empty-all-caught-up-compact.svg` |

Avoid playing eight animated illustrations simultaneously on a dashboard. Prefer static compact artwork there; reserve the one-shot entrance for a focused first-use panel. Existing ghost bars in chart panels may remain more useful than an illustration.

## Reports and care

| Location / condition | Artwork |
|---|---|
| Report not run yet | `empty-reports.svg` with Run report / period guidance |
| Time report: no completed entries | `empty-time.svg` |
| Invoice report: no invoices in range | Parent approved invoice art, static if part of a dense report |
| Task report: no activity in range | `empty-tasks.svg` |
| Scheduled versus visited hours: no data | `empty-schedule.svg` |
| Expense report: initial prompt | `empty-reports.svg` |
| Expense report: currently coming soon | None | 
| Care schedule: no shifts on selected day | `empty-schedule.svg` |
| Care account tab: no visits | `empty-activity-compact.svg` |
| Care account tab: no upcoming shifts | `empty-schedule-compact.svg` |

Keep “coming soon” as a capability message. Do not make it look like a report with no data.

## Shared record details and configuration

| Location / condition | Artwork |
|---|---|
| Attachments: no files | `empty-files-compact.svg` |
| Saved links: none | `empty-links-compact.svg` |
| Notes: none | `empty-notes-compact.svg` |
| Account related projects: none | `empty-projects-compact.svg` |
| Related invoices: none | Parent approved invoice artwork at appropriate size |
| People linked to account / project: none | `empty-people-compact.svg` |
| Accounts linked to a person: none | `empty-accounts-compact.svg`; preserve Make client action |
| Project members / users: none | `empty-team.svg` or compact |
| No members of a role | `empty-team-compact.svg` |
| Project contacts: none | `empty-people-compact.svg` |
| Project open-task preview / default tasks: none | `empty-tasks-compact.svg` |
| Task comments: none | `empty-comments-compact.svg` |
| Invoice line items: none | `empty-line-items-compact.svg` |
| No uninvoiced time or reimbursable expenses | `empty-line-items-compact.svg` with precise period-specific copy |
| Account forms: none | `empty-forms-compact.svg` |
| Form sharing links: none | `empty-links-compact.svg` |
| Form builder: no sections / fields | `empty-form-builder.svg` |
| Form sections sidebar: none | `empty-form-builder-compact.svg` |
| Form score areas, profiles, roles: none | `empty-settings-compact.svg` |
| Project custom fields: none | `empty-settings-compact.svg` |
| Custom organization-field options: none | `empty-settings-compact.svg` |
| Expense categories / payment methods: none | `empty-settings-compact.svg` |
| API keys: none | `empty-api-keys.svg` or compact |
| Help assistant: no saved conversations / messages | `empty-conversations.svg` or compact |
| Help assistant report: no records | `empty-reports-compact.svg` |

## Search and intentionally text-only states

Use `empty-search.svg` for larger no-results views and `empty-search-compact.svg` for panels. Covers global search and filtered accounts, people, projects, invoices, forms, tasks, bookings, expenses, and activity. In a dense selector dropdown, concise text is usually preferable to any art.

Keep text-only: no task description; individual blank fields; no pipeline next step; no configured email-capture address; all projects already added; record already in every pipeline; no other project to select; missing integration configuration; ordinary form validation; report coming soon. These are small configuration, explanation, or recovery messages, not empty-screen illustrations.

## Action states already approved

Use parent `status-success.svg` / `status-success-compact.svg` and `status-error.svg` / `status-error-compact.svg` with the parent approved runtime. A failed load must not be displayed as a first-use empty state. This batch does not add or alter those approved action states.
