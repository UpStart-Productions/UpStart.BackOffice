-- Attachment, due date, move and subtask emails are now off unless turned on. Inbox → Settings never offered
-- these, so any stored value is just the old default that was saved alongside other choices: drop it.
UPDATE "UserNotificationPreference"
SET "emailPreferences" = "emailPreferences"::jsonb - 'task_attachment' - 'task_due_date_changed' - 'task_moved' - 'task_subtask_added';
