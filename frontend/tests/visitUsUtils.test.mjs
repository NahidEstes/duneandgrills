import assert from "node:assert/strict";
import test from "node:test";
import { buildMapEmbedUrl, groupOpeningHours } from "../src/utils/visitUs.js";

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

test("builds a light default Google Maps embed around the configured address", () => {
  const url = new URL(buildMapEmbedUrl({ address: "Al Wadi", city: "Riyadh", country: "Saudi Arabia" }));
  assert.equal(url.hostname, "www.google.com");
  assert.equal(url.searchParams.get("q"), "Al Wadi, Riyadh, Saudi Arabia");
  assert.equal(url.searchParams.get("z"), "12");
  assert.equal(url.searchParams.get("output"), "embed");
});
