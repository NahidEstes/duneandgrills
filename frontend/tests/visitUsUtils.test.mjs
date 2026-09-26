import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOpeningHoursGroup,
  buildMapEmbedUrl,
  groupOpeningHours,
  OPENING_HOUR_GROUPS,
} from "../src/utils/visitUs.js";

const week = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  .map((day) => ({
    day,
    isOpen: true,
    periods: [{ open: day === "friday" ? "13:00" : "11:00", close: "23:00" }],
  }));

test("groups identical contiguous opening schedules in customer-facing order", () => {
  assert.deepEqual(groupOpeningHours(week), [
    {
      days: ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday"],
      isOpen: true,
      label: "Sat–Thu",
      schedule: "11:00 AM – 11:00 PM",
    },
    {
      days: ["friday"],
      isOpen: true,
      label: "Friday",
      schedule: "1:00 PM – 11:00 PM",
    },
  ]);
});

test("keeps Friday separate even when its saved schedule matches the rest of the week", () => {
  const sameSchedule = week.map((entry) => ({ ...entry, periods: [{ open: "11:00", close: "23:00" }] }));
  assert.deepEqual(groupOpeningHours(sameSchedule).map(({ label }) => label), ["Sat–Thu", "Friday"]);
});

test("admin group updates change Sat–Thu together without changing Friday", () => {
  const updated = applyOpeningHoursGroup(week, OPENING_HOUR_GROUPS[0], {
    isOpen: true,
    periods: [{ open: "10:30", close: "22:00" }],
  });
  assert.equal(updated.find((day) => day.day === "sunday").periods[0].open, "10:30");
  assert.equal(updated.find((day) => day.day === "thursday").periods[0].close, "22:00");
  assert.equal(updated.find((day) => day.day === "friday").periods[0].open, "13:00");
});

test("builds a light default Google Maps embed around the configured address", () => {
  const url = new URL(buildMapEmbedUrl({ address: "Al Wadi", city: "Riyadh", country: "Saudi Arabia" }));
  assert.equal(url.hostname, "www.google.com");
  assert.equal(url.searchParams.get("q"), "Al Wadi, Riyadh, Saudi Arabia");
  assert.equal(url.searchParams.get("z"), "12");
  assert.equal(url.searchParams.get("output"), "embed");
});
