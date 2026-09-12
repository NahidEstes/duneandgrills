import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  normalizeNotificationSettings,
} from "../src/utils/notificationSettings.js";

test("notification settings retain safe defaults", () => {
  assert.deepEqual(normalizeNotificationSettings(), DEFAULT_NOTIFICATION_SETTINGS);
});

test("notification timing is normalized to server-supported limits", () => {
  const settings = normalizeNotificationSettings({
    adminSoundEnabled: false,
    kitchenSoundEnabled: false,
    alertRepeatIntervalSeconds: 1,
    maximumAlertRepeats: 900,
    pollingIntervalSeconds: "12",
  });

  assert.equal(settings.adminSoundEnabled, false);
  assert.equal(settings.kitchenSoundEnabled, false);
  assert.equal(settings.alertRepeatIntervalSeconds, 2);
  assert.equal(settings.maximumAlertRepeats, 500);
  assert.equal(settings.pollingIntervalSeconds, 12);
});
