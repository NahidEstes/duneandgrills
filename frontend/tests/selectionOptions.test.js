import assert from "node:assert/strict";
import { test } from "node:test";
import { collectSelectionOptions } from "../src/api/selectionOptions.js";

test("paginated staff/supplier pickers preserve options beyond the first page", async () => {
  const calls = [];
  const rows = await collectSelectionOptions(async ({ page, limit }) => {
    calls.push({ page, limit });
    return page === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }];
  }, 2);
  assert.deepEqual(rows.map(row => row.id), [1, 2, 3]);
  assert.deepEqual(calls, [{ page: 1, limit: 2 }, { page: 2, limit: 2 }]);
});

test("empty selection options terminate without additional requests", async () => {
  let calls = 0;
  assert.deepEqual(await collectSelectionOptions(async () => { calls += 1; return []; }), []);
  assert.equal(calls, 1);
});
