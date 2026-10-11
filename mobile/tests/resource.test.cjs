const { test } = require('node:test'); const assert = require('node:assert/strict');
const { ResourceController } = require('../.test-build/services/resource-controller'); const { ApiError } = require('../.test-build/services/api-client');
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(load, poll = () => value => !value.terminal) {
  let now = 0; let next = 0; const timers = new Map(); const values = []; const errors = [];
  const time = { now: () => now, set: (work, delay) => { const id = ++next; timers.set(id, { work, at: now + delay }); return id; }, clear: id => timers.delete(id) };
  const runner = new ResourceController(load, value => values.push(value), error => errors.push(error), () => {}, poll, 30000, time);
  const advance = async delay => { now += delay; const due = [...timers.entries()].filter(([, t]) => t.at <= now); for (const [id, t] of due) { timers.delete(id); t.work(); } await settle(); };
  return { runner, values, errors, timers, advance };
}
test('foreground polling stops for terminal state and manual terminal refresh cancels its timer', async () => {
  let calls = 0; const f = fixture(async () => ({ terminal: ++calls >= 2 }));
  f.runner.activate(); await settle(); assert.equal(f.timers.size, 1);
  await f.runner.refresh(); assert.equal(f.timers.size, 0); await f.advance(90000); assert.equal(calls, 2); f.runner.deactivate();
});
test('background/blur aborts reads; late responses cannot change state or create timers after resume', async () => {
  const pending = []; const f = fixture(signal => new Promise(resolve => pending.push({ signal, resolve })));
  f.runner.activate(); f.runner.deactivate(); assert.equal(pending[0].signal.aborted, true);
  f.runner.activate(); assert.equal(pending.length, 2); pending[0].resolve({ terminal: false, old: true }); await settle(); assert.equal(f.values.length, 0); assert.equal(f.timers.size, 0);
  pending[1].resolve({ terminal: false }); await settle(); assert.equal(f.values.length, 1); assert.equal(f.timers.size, 1);
  f.runner.deactivate(); await f.advance(120000); assert.equal(pending.length, 2);
});
test('concurrent manual/resume refreshes never overlap or leave more than one timer', async () => {
  let complete; let calls = 0; const f = fixture(() => { calls++; return new Promise(resolve => { complete = resolve; }); });
  f.runner.activate(); f.runner.activate(); await f.runner.refresh(); assert.equal(calls, 1);
  complete({ terminal: false }); await settle(); assert.equal(f.timers.size, 1); f.runner.deactivate();
});
test('throttling observes retry-after even on manual refresh; outages back off; forbidden reads stop on resume', async () => {
  let calls = 0; const f = fixture(async () => { calls++; throw new ApiError('Wait', 429, 'http', 120); });
  f.runner.activate(); await settle(); await f.runner.refresh(); await f.advance(119000); assert.equal(calls, 1);
  await f.advance(1000); assert.equal(calls, 2); f.runner.deactivate();
  const denied = fixture(async () => { throw new ApiError('Expired', 401, 'http'); });
  denied.runner.activate(); await settle(); assert.equal(denied.timers.size, 0); denied.runner.deactivate(); denied.runner.activate(); await settle(); assert.equal(denied.errors.length, 1); denied.runner.deactivate();
  const offline = fixture(async () => { throw new ApiError('Offline', 0, 'network'); });
  offline.runner.activate(); await settle(); await offline.advance(59000); assert.equal(offline.errors.length, 1); await offline.advance(1000); assert.equal(offline.errors.length, 2); offline.runner.deactivate();
});
