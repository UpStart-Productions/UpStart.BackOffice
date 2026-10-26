# In-app notifications (top-bar bell)

Per-user inbox stored in `UserNotification`. Task Manager delivers via `NotificationDeliveryService` (in-app row + optional email when `TASK_EMAIL_NOTIFICATIONS` is not `off`):

| Type | When |
|------|------|
| `task_assigned` | Create/update assigns someone |
| `task_unassigned` | Assignee removed or reassigned |
| `task_mention` | @mention in description or comment |
| `task_comment` | New comment (non-system) |
| `task_completed` | Task marked complete |
| `task_due_date_changed` | Due date set or cleared |
| `task_attachment` | File attached |
| `task_moved` | Project or section move |
| `task_subtask_added` | Subtask created on a followed parent |
| `project_added` | Added to a Task Manager project |
| `project_removed` | Removed from a project by someone else |
| `task_form_submission` | Public task form submitted |

## Add a new notification type

1. **`libs/shared/src/lib/notifications.ts`**
   - Add the type string to `NotificationType` and `NOTIFICATION_TYPES`.

2. **API delivery**
   - Call `NotificationDeliveryService.deliver()` or `deliverMany()` with:
     - `userId`, optional `tenantId` (defaults from the user row)
     - `type`, `title`, optional `body`
     - `meta.route`: admin route segments for the bell link (e.g. `['tasks', 'projects', projectId, 'tasks', taskId]`)
   - See `api/src/app/task-manager/task-events.service.ts` for examples.

3. **Email preference (optional)**
   - Add a boolean field to `EmailPreferencesDto` in `api/src/app/notifications/dto/notifications.dto.ts` matching the new type key.

4. **Bell UI (optional)**
   - Default row: title link (from `meta.route` / `resolveNotificationRoute`), body snippet, Mark read, Dismiss.
   - For custom actions (approve/decline, modal): extend `admin/src/app/ui/notifications-bell/notification-ui.registry.ts`.

## HTTP API (signed-in back-office user)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/notifications?unreadOnly=true&limit=100` | Inbox list |
| GET | `/notifications/unread-count` | Badge count |
| PATCH | `/notifications/:id/read` | Mark read |
| DELETE | `/notifications/:id` | Dismiss (archive) |
| POST | `/notifications/read-all` | Mark all read |
| GET/PUT | `/notifications/preferences` | Email toggles per type |

## Admin UI

- `admin/src/app/ui/notifications-bell/` — bell + popover (Nonprofit-style layout).
- Polls unread count every 5 minutes; loads full unread list when the panel opens.
