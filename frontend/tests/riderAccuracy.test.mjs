import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRiderRead } from "../src/components/rider/riderReadState.js";
import { riderCash, paymentLabel, cashReportError, deliveryFingerprint } from "../src/components/rider/riderPresentation.js";

test("authoritative cash states do not re-collect reported cash or reopen refunded balances", () => {
  for (const state of ["awaiting_confirmation", "discrepancy", "confirmed"]) {
    const cash = riderCash({ cashState: state, customerCollectionHalala: null, reportedCashHalala: 3000, amountToCollect: 40 });
    assert.equal(cash.amount, 30); assert.doesNotMatch(cash.label, /^Collect/);
  }
  assert.equal(riderCash({ cashState: "collection_pending", customerCollectionHalala: 4000 }).amount, 40);
  assert.equal(riderCash({ cashState: "no_collection", paymentStatus: "refunded" }).amount, 0);
  assert.equal(riderCash({ paymentStatus: "pending", amountToCollect: 40 }).amount, null);
  for (const status of ["unpaid", "pending", "paid", "partially_refunded", "refunded", "voided", "failed"]) assert.notEqual(paymentLabel(status), "Payment unavailable");
  assert.equal(paymentLabel("unsupported"), "Payment unavailable");
});

test("confirmed receipt remains a recorded fact even when a refunded order requires review", async () => {
  const component = await readFile(new URL("../src/components/rider/RiderCash.jsx", import.meta.url), "utf8");
  assert.match(component, /delivery.cashReport\?\.status === "confirmed" \? amount\(delivery.reportedCashHalala\)/);
  assert.equal(riderCash({ cashState: "unavailable", paymentStatus: "refunded", reportedCashHalala: 4000, cashReport: { status: "confirmed" } }).amount, null);
});

test("cash confirmation validates decimal format, balance and shortage reason; revision changes need review", () => {
  const data = { customerCollectionHalala: 4000, revision: 1, orderRevision: 2 };
  for (const amount of ["", "-1", "1.001", "1e1", "41", "Infinity"]) assert.ok(cashReportError(amount, "reason", data));
  assert.ok(cashReportError("30", " ", data)); assert.equal(cashReportError("30.25", "shortage", data), "");
  assert.equal(cashReportError("40", "", data), "");
  assert.notEqual(deliveryFingerprint(data), deliveryFingerprint({ ...data, orderRevision: 3 }));
});

test("rider refresh retains cards/stamp, deduplicates, recovers and detects assignments independent of page", async () => {
  let state, resolve, reject, calls = 0, clock = 0;
  const reader = createRiderRead(() => { calls++; return new Promise((yes, no) => { resolve = yes; reject = no; }); }, value => { state = value; }, () => new Date(++clock));
  const first = reader.refresh("page1"); await Promise.resolve();
  assert.equal(state.loading, true); resolve({ mode: "operational", assignmentCount: 5, deliveries: ["A"] }); await first;
  const original = state.data, stamp = state.updatedAt;
  const next = reader.refresh("page2"); assert.equal(reader.refresh("page2"), next); await Promise.resolve();
  assert.equal(state.data, original); assert.equal(state.refreshing, true); assert.equal(state.updatedAt, stamp);
  resolve({ mode: "operational", assignmentCount: 5, deliveries: ["B"] }); await next;
  assert.equal(state.newAssignment, false);
  const fail = reader.refresh("page2"); await Promise.resolve(); reject(new Error("offline")); await fail;
  assert.equal(state.data.deliveries[0], "B"); assert.equal(state.error, "offline"); const staleStamp = state.updatedAt;
  const recover = reader.refresh("page2"); assert.equal(state.error, "offline"); await Promise.resolve(); resolve({ mode: "operational", assignmentCount: 6, deliveries: ["B"] }); await recover;
  assert.equal(state.newAssignment, true); assert.ok(state.updatedAt > staleStamp); assert.equal(state.error, ""); reader.dismiss(); assert.equal(state.newAssignment, false);
  assert.equal(calls, 4); reader.stop();
});

test("latest response wins; unmount and permission loss discard protected responses", async () => {
  const jobs = []; let state;
  const reader = createRiderRead(signal => new Promise(resolve => jobs.push({ signal, resolve })), value => { state = value; });
  const old = reader.refresh("old"); await Promise.resolve(); const fresh = reader.refresh("fresh"); await Promise.resolve();
  assert.equal(jobs[0].signal.aborted, true); jobs[1].resolve({ mode: "operational", deliveries: ["fresh"] }); await fresh;
  jobs[0].resolve({ mode: "operational", deliveries: ["old"] }); await old; assert.equal(state.data.deliveries[0], "fresh");
  const late = reader.refresh("late"); await Promise.resolve(); reader.stop(); const before = state;
  jobs[2].resolve({ mode: "operational", deliveries: ["private"] }); await late; assert.equal(state, before);
  let deny = false;
  const access = createRiderRead(async () => { if (deny) throw { response: { status: 403 } }; return { mode: "operational", deliveries: ["own"] }; }, value => { state = value; });
  await access.refresh("own"); deny = true; await access.refresh("own"); assert.equal(state.data, null); assert.equal(state.updatedAt, null); assert.equal(state.denied, true);
});

test("mode changes clear protected activity and reset assignment notice", async () => {
  let mode = "operational", state;
  const reader = createRiderRead(async () => ({ mode, assignmentCount: 5, deliveries: mode === "disabled" ? [] : ["own"] }), value => { state = value; });
  await reader.refresh("same"); mode = "disabled"; await reader.refresh("same"); assert.deepEqual(state.data.deliveries, []); assert.equal(state.newAssignment, false);
});

test("logout before fetch starts never reads, and mutation invalidation follows an in-flight read", async () => {
  let calls = 0, state, resolve;
  const stopped = createRiderRead(async () => { calls++; }, () => {});
  const pending = stopped.refresh("own"); stopped.stop(); await pending; assert.equal(calls, 0);
  const active = createRiderRead(() => { calls++; return new Promise(done => { resolve = done; }); }, value => { state = value; });
  const first = active.refresh("own"); await Promise.resolve();
  const invalidated = active.invalidate("own"); resolve({ mode: "operational", revision: 0 }); await first; await Promise.resolve();
  assert.equal(calls, 2); resolve({ mode: "operational", revision: 1 }); await invalidated;
  assert.equal(state.data.revision, 1);
});

test("history search applies explicitly, rider scope clears on actor/mode changes and admin stays manual", async () => {
  const read = path => readFile(new URL(path, import.meta.url), "utf8");
  const filters = await read("../src/components/rider/RiderHistoryFilters.jsx");
  assert.match(filters, /onSubmit=/); assert.doesNotMatch(filters, /useEffect|fetch|setInterval/);
  const hook = await read("../src/hooks/useRiderRead.js");
  assert.match(hook, /state.scope === scope && allowed/); assert.match(hook, /30_000/); assert.match(hook, /document.visibilityState === "visible"/); assert.match(hook, /current.stop\(\)/);
  const admin = await read("../src/hooks/useDeliveryManagement.js");
  assert.doesNotMatch(admin, /setInterval|addEventListener|useRiderRead/);
});
