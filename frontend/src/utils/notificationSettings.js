export const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  adminSoundEnabled: true,
  kitchenSoundEnabled: true,
  alertRepeatIntervalSeconds: 5,
  maximumAlertRepeats: 60,
  pollingIntervalSeconds: 5,
});

const boundedInteger = (value, fallback, minimum, maximum) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
};

export const normalizeNotificationSettings = (value = {}) => ({
  adminSoundEnabled: value.adminSoundEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.adminSoundEnabled,
  kitchenSoundEnabled: value.kitchenSoundEnabled ?? DEFAULT_NOTIFICATION_SETTINGS.kitchenSoundEnabled,
  alertRepeatIntervalSeconds: boundedInteger(value.alertRepeatIntervalSeconds, 5, 2, 300),
  maximumAlertRepeats: boundedInteger(value.maximumAlertRepeats, 60, 1, 500),
  pollingIntervalSeconds: boundedInteger(value.pollingIntervalSeconds, 5, 3, 60),
});

export const RESTAURANT_SETTINGS_UPDATED_EVENT = "dg:restaurant-settings-updated";
