-- In-app and push notification preferences (per-type booleans; missing keys use product defaults).
ALTER TABLE "UserNotificationPreference" ADD COLUMN "inAppPreferences" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "UserNotificationPreference" ADD COLUMN "pushPreferences" JSONB NOT NULL DEFAULT '{}';
