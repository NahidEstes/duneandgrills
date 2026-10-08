import assert from "node:assert/strict";
import { test } from "node:test";
import { createRefreshController } from "../src/utils/refreshController.js";
import { dashboardMoney, dashboardNumber, successfulUpdateLabel } from "../src/components/admin/dashboardFreshness.js";

const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const failure = status => ({ response: { status, data: { message: `Fixture ${status}` } } });
function harness(fetcher, options = {}) {
  let clock = 1_000_000, connected = true, sequence = 0;
  const timers = new Map(), target = new EventTarget(), documentTarget = new EventTarget(); documentTarget.hidden = false;
  const states = [], dataEvents = [], authEvents = [];
  const controller = createRefreshController({ fetcher, onState: state => states.push(state), onData: data => dataEvents.push(data), onUnauthorized: error => authEvents.push(error), target, documentTarget,
    online: () => connected, now: () => clock, schedule: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, at: clock + delay }); return id; }, cancel: id => timers.delete(id), ...options });
  return { controller, timers, states, dataEvents, authEvents, target, documentTarget,
    event: event => target.dispatchEvent(new Event(event)),
    hidden(value) { documentTarget.hidden = value; documentTarget.dispatchEvent(new Event("visibilitychange")); },
    online(value) { connected = value; target.dispatchEvent(new Event(value ? "online" : "offline")); },
    async advance(ms) { const end = clock + ms; for (;;) { const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; clock = due[1].at; timers.delete(due[0]); due[1].callback(); await flush(); } clock = end; await flush(); },
  };
}

test("initial failure is persistent error, not zero/empty data or a successful timestamp", async () => {
  const h = harness(async () => { throw failure(503); }); await h.controller.start();
  assert.equal(h.controller.getState().status, "error"); assert.equal(h.controller.getState().data, null); assert.equal(h.controller.getState().lastSuccessAt, null);
  assert.equal(dashboardMoney(undefined), "—"); assert.equal(dashboardNumber(null), "—"); assert.equal(successfulUpdateLabel(null), null);
  h.controller.dispose();
});
test("genuine zero/empty success is distinct from unavailable metrics", async () => {
  const h = harness(async () => ({ count: 0, rows: [] })); await h.controller.start();
  assert.equal(h.controller.getState().status, "success"); assert.deepEqual(h.controller.getState().data, { count: 0, rows: [] });
  assert.equal(dashboardNumber(0), "0"); assert.notEqual(dashboardMoney(0), "—"); assert.equal(dashboardMoney(NaN), "—"); h.controller.dispose();
});
test("refresh retains successful data; failure marks stale; recovery changes only the successful timestamp", async () => {
  let fail = false; const h = harness(async () => { if (fail) throw failure(500); return { count: 4 }; });
  await h.controller.start(); const first = h.controller.getState().lastSuccessAt;
  fail = true; await h.advance(2000); await h.controller.refresh();
  assert.equal(h.controller.getState().status, "stale"); assert.equal(h.controller.getState().data.count, 4); assert.equal(h.controller.getState().lastSuccessAt, first);
  fail = false; await h.advance(15_000); assert.equal(h.controller.getState().status, "success"); assert.equal(h.controller.getState().error, null); assert.ok(h.controller.getState().lastSuccessAt > first); h.controller.dispose();
});
test("manual/focus/timer deduplicate an in-flight request; valid data remains during refresh", async () => {
  const pending = deferred(); let calls = 0; const h = harness(() => { calls++; return pending.promise; });
  const initial = h.controller.start(); h.event("focus"); h.controller.refresh(); await h.advance(60_000); assert.equal(calls, 1);
  pending.resolve({ count: 2 }); await initial; await h.advance(60_000); assert.equal(calls, 2); h.controller.dispose();
});
test("focus and visible triggers arriving together after a quick response do not double fetch", async () => {
  let calls = 0; const h = harness(async () => ({ count: ++calls })); await h.controller.start();
  await h.advance(2000); h.event("focus"); await flush(); h.hidden(false); await flush(); assert.equal(calls, 2); h.controller.dispose();
});
test("summary hidden-tab timers pause, visible recovery restarts, disposal removes listeners/timers", async () => {
  let calls = 0; const h = harness(async () => ({ count: ++calls })); await h.controller.start(); h.hidden(true);
  await h.advance(180_000); h.event("focus"); await flush(); assert.equal(calls, 1); assert.equal(h.timers.size, 0);
  h.hidden(false); await flush(); assert.equal(calls, 2); h.controller.dispose(); assert.equal(h.timers.size, 0);
  h.event("focus"); h.online(true); await h.advance(120_000); assert.equal(calls, 2);
});
test("configured urgent order polling continues hidden without summary refresh", async () => {
  let calls = 0; const h = harness(async () => ({ count: ++calls }), { pauseWhenHidden: false, intervalMs: 5000 });
  await h.controller.start(); h.hidden(true); await h.advance(10_000); assert.equal(calls, 3); h.controller.dispose();
});
test("offline aborts old request, makes no retries, and a late response cannot overwrite recovery", async () => {
  const old = deferred(); let calls = 0, signal;
  const h = harness(options => { calls++; signal ||= options.signal; return calls === 1 ? old.promise : Promise.resolve({ count: 9 }); });
  h.controller.start(); await flush(); h.online(false); assert.equal(signal.aborted, true);
  await h.advance(300_000); assert.equal(calls, 1); assert.equal(h.controller.getState().errorKind, "offline");
  h.online(true); await flush(); assert.equal(h.controller.getState().data.count, 9);
  old.resolve({ count: 1 }); await flush(); assert.equal(h.controller.getState().data.count, 9); h.controller.dispose();
});
test("unmount/logout ignores delayed responses and notifications", async () => {
  const pending = deferred(); const h = harness(() => pending.promise); h.controller.start(); await flush(); h.controller.dispose();
  const length = h.states.length; pending.resolve({ count: 7 }); await flush();
  assert.equal(h.states.length, length); assert.equal(h.dataEvents.length, 0); assert.equal(h.timers.size, 0);
});

test("immediate logout before the queued fetch starts issues no API call", async () => {
  let calls = 0; const h = harness(async () => { calls++; return {}; });
  h.controller.start(); h.controller.dispose(); await flush();
  assert.equal(calls, 0); assert.equal(h.dataEvents.length, 0); assert.equal(h.timers.size, 0);
});
test("expired/forbidden sessions stop all retries and invoke existing auth handling once", async () => {
  for (const status of [401, 403]) { let calls = 0; const h = harness(async () => { calls++; throw failure(status); }); await h.controller.start();
    h.event("focus"); h.online(true); await h.controller.refresh(); await h.advance(600_000);
    assert.equal(calls, 1); assert.equal(h.authEvents.length, 1); assert.equal(h.timers.size, 0); h.controller.dispose(); }
});
test("recoverable API failure uses capped backoff; focus cannot cause retry storms", async () => {
  let calls = 0; const h = harness(async () => { calls++; throw failure(502); }, { retryBaseMs: 5000, retryMaxMs: 20_000 });
  await h.controller.start(); for (let n = 0; n < 20; n++) h.event("focus"); await flush(); assert.equal(calls, 1);
  await h.advance(5000); assert.equal(calls, 2); await h.advance(10_000); assert.equal(calls, 3); await h.advance(20_000); assert.equal(calls, 4); await h.advance(20_000); assert.equal(calls, 5); h.controller.dispose();
});
test("mutation during a request schedules one follow-up instead of dropping invalidation or overlapping", async () => {
  const first = deferred(); let calls = 0; const h = harness(() => ++calls === 1 ? first.promise : Promise.resolve({ count: 2 }));
  h.controller.start(); h.controller.refresh("mutation"); h.controller.refresh("mutation"); await flush(); assert.equal(calls, 1);
  first.resolve({ count: 1 }); await flush(); await h.advance(1000); assert.equal(calls, 2); h.controller.dispose();
});
test("summary success/failure is independent of pending-order polling state", async () => {
  const summary = harness(async () => ({ count: 7 })), monitoring = harness(async () => { throw failure(503); });
  await summary.controller.start(); await monitoring.controller.start(); await summary.controller.refresh();
  assert.equal(summary.controller.getState().status, "success"); assert.equal(monitoring.controller.getState().status, "error"); assert.equal(monitoring.dataEvents.length, 0);
  summary.controller.dispose(); monitoring.controller.dispose();
});

test("successful bulk mutation callbacks are coalesced without duplicate summary requests", async () => {
  let calls = 0; const h = harness(async () => ({ count: ++calls })); await h.controller.start();
  for (let n = 0; n < 20; n++) h.controller.refresh("mutation");
  await h.advance(249); assert.equal(calls, 1); await h.advance(1); assert.equal(calls, 2);
  await h.advance(1000); assert.equal(calls, 2); h.controller.dispose();
});

test("hidden failures retain backoff but recover promptly when visible after retry deadline", async () => {
  let calls = 0, fail = true;
  const h = harness(async () => { calls++; if (fail) throw failure(503); return {}; });
  await h.controller.start(); h.hidden(true); await h.advance(16_000); fail = false; h.hidden(false); await flush();
  assert.equal(calls, 2); assert.equal(h.controller.getState().status, "success"); h.controller.dispose();
});
test("successful timestamps carry exact accessible Riyadh dates and honest relative text", () => {
  const stamp = Date.parse("2026-10-07T21:01:02Z"), label = successfulUpdateLabel(stamp, stamp + 120_000);
  assert.equal(label.relative, "2 min ago"); assert.match(label.exact, /0?8 Oct 2026/); assert.match(label.exact, /12:01:02 am/); assert.match(label.exact, /Asia\/Riyadh/); assert.equal(label.iso, "2026-10-07T21:01:02.000Z");
});
