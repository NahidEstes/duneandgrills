import assert from "node:assert/strict";
import test from "node:test";
import {
  getRestaurantSettingsDefaults,
  getRestaurantSettingsDiff,
  normalizeRestaurantSettings,
  toPublicRestaurantSettings,
  upgradeLegacyOpeningHours,
} from "../services/restaurantSettingsService.js";

test("restaurant settings defaults use the configured Riyadh weekly schedule", () => {
  const defaults = getRestaurantSettingsDefaults();
  assert.equal(defaults.timezone, "Asia/Riyadh");
  assert.deepEqual(defaults.openingHours.find((day) => day.day === "saturday").periods[0], { open: "11:00", close: "23:00" });
  assert.deepEqual(defaults.openingHours.find((day) => day.day === "friday").periods[0], { open: "13:00", close: "23:00" });
});

test("legacy all-week defaults upgrade Friday without changing custom schedules", () => {
  const oldHours = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    .map((day) => ({ day, isOpen: true, periods: [{ open: "11:00", close: "23:00" }] }));
  const upgraded = upgradeLegacyOpeningHours(oldHours);
  assert.equal(upgraded.find((day) => day.day === "friday").periods[0].open, "13:00");

  const custom = structuredClone(oldHours);
  custom.find((day) => day.day === "monday").periods[0].open = "10:00";
  assert.deepEqual(upgradeLegacyOpeningHours(custom), custom);
});

test("restaurant settings accept overnight hours and normalize numbers", () => {
  const defaults = getRestaurantSettingsDefaults();
  const openingHours = defaults.openingHours.map((day) => day.day === "friday"
    ? { ...day, periods: [{ open: "13:00", close: "00:30" }] }
    : day);
  const settings = normalizeRestaurantSettings({
    openingHours,
    orders: { deliveryFee: "12.50", minimumDeliveryOrder: "35" },
    preparation: { defaultMinutes: "25" },
  }, defaults);
  assert.deepEqual(settings.openingHours.find((day) => day.day === "friday").periods[0], { open: "13:00", close: "00:30" });
  assert.equal(settings.orders.deliveryFee, 12.5);
  assert.equal(settings.orders.minimumDeliveryOrder, 35);
  assert.equal(settings.preparation.defaultMinutes, 25);
});

test("restaurant settings reject invalid values", () => {
  const defaults = getRestaurantSettingsDefaults();
  assert.throws(() => normalizeRestaurantSettings({ orders: { deliveryFee: -1 } }, defaults), /Delivery fee/);
  assert.throws(() => normalizeRestaurantSettings({ orders: { channels: { website: "false" } } }, defaults), /Toggle values/);
  assert.throws(() => normalizeRestaurantSettings({ location: { email: "invalid" } }, defaults), /email is invalid/i);
  assert.throws(() => normalizeRestaurantSettings({ receipt: { websiteUrl: "javascript:alert(1)" } }, defaults), /HTTP or HTTPS/);
  const hours = structuredClone(defaults.openingHours);
  hours[0].periods[0].open = "25:00";
  assert.throws(() => normalizeRestaurantSettings({ openingHours: hours }, defaults), /invalid time/);
  const invalidToggle = structuredClone(defaults.openingHours);
  invalidToggle[0].isOpen = "false";
  assert.throws(() => normalizeRestaurantSettings({ openingHours: invalidToggle }, defaults), /open status/);
});

test("public settings exclude notification and audit-only fields", () => {
  const settings = { ...getRestaurantSettingsDefaults(), updatedBy: "private", internalFlag: true };
  const publicSettings = toPublicRestaurantSettings(settings);
  assert.equal("notifications" in publicSettings, false);
  assert.equal("updatedBy" in publicSettings, false);
  assert.deepEqual(Object.keys(publicSettings.orders.channels).sort(), ["pos", "website"]);
  assert.match(publicSettings.receipt.address, /Riyadh/);
});

test("audit diff includes only changed leaf fields", () => {
  const before = getRestaurantSettingsDefaults();
  const after = structuredClone(before);
  after.orders.deliveryFee = 17;
  after.location.phone = "+966500000000";
  const diff = getRestaurantSettingsDiff(before, after);
  assert.deepEqual(diff.changedFields.sort(), ["location.phone", "orders.deliveryFee"]);
  assert.deepEqual(diff.oldValues.map(({ field }) => field).sort(), diff.changedFields.sort());
  assert.equal(diff.newValues.find(({ field }) => field === "orders.deliveryFee").value, 17);
});
