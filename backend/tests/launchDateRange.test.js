import assert from "node:assert/strict";
import { test } from "node:test";
import { riyadhDateRange } from "../utils/adminDate.js";

test("inventory date filters include Riyadh midnight and exclude the next midnight", () => {
  const range = riyadhDateRange({ from: "2026-10-06", to: "2026-10-06" });
  assert.equal(range.$gte.toISOString(), "2026-10-05T21:00:00.000Z");
  assert.equal(range.$lt.toISOString(), "2026-10-06T21:00:00.000Z");
  assert.equal(new Date("2026-10-06T20:59:59.999Z") < range.$lt, true);
});

test("inventory date filters reject impossible or reversed ranges", () => {
  assert.throws(() => riyadhDateRange({ from: "2026-02-30" }));
  assert.throws(() => riyadhDateRange({ from: "2026-10-07", to: "2026-10-06" }));
});

test("inventory date filters preserve open-ended filters", () => {
  assert.deepEqual(riyadhDateRange(), {});
  assert.deepEqual(Object.keys(riyadhDateRange({ from: "2026-10-06" })), ["$gte"]);
  assert.deepEqual(Object.keys(riyadhDateRange({ to: "2026-10-06" })), ["$lt"]);
});
