import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);
const { transformSync } = require("next/dist/build/swc");
const code = transformSync(readFileSync(new URL("../src/components/inventory/useInventoryResource.js", import.meta.url), "utf8"), { jsc: { parser: { syntax: "ecmascript" } }, module: { type: "commonjs" } }).code;
const equal = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(setImmediate);

function harness() {
  const slots = [];
  let cursor = 0, pending = [];
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ?? (slots[index] = { current: initial }); },
    useCallback(callback, deps) { const index = cursor++; if (!slots[index] || !equal(slots[index].deps, deps)) slots[index] = { deps, callback }; return slots[index].callback; },
    useEffect(effect, deps) { const index = cursor++; const previous = slots[index]; if (!previous || !equal(previous.deps, deps)) { slots[index] = { effect, deps, cleanup: previous?.cleanup }; pending.push(index); } },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => name === "react" ? hooks : require(name), mod, mod.exports);
  const effects = () => { const queue = pending; pending = []; for (const index of queue) { slots[index].cleanup?.(); slots[index].cleanup = slots[index].effect(); } };
  return {
    render(loader, deps, commit = true) { cursor = 0; const resource = mod.exports.default(loader, deps); if (commit) effects(); return resource; },
    commit: effects,
    unmount() { for (const slot of slots) slot?.cleanup?.(); },
    replay() { for (const slot of slots) slot?.cleanup?.(); for (const slot of slots) if (slot?.effect) slot.cleanup = slot.effect(); },
  };
}

test("late success and failure cannot replace a newer inventory filter result", async () => {
  for (const oldFails of [false, true]) {
    const view = harness(), old = deferred(), fresh = deferred();
    const a = () => old.promise, b = () => fresh.promise;
    view.render(a, ["old"]); view.render(b, ["new"]);
    fresh.resolve(["new result"]); await flush();
    if (oldFails) old.reject(new Error("old failure")); else old.resolve(["old result"]);
    await flush();
    const state = view.render(b, ["new"]);
    assert.deepEqual(state.data, ["new result"]);
    assert.equal(state.error, null);
    assert.equal(state.loading, false);
    view.unmount();
  }
});

test("old requests cannot stop a newer spinner or expose rows under changed filters", async () => {
  const view = harness(), old = deferred(), fresh = deferred();
  const a = () => old.promise, b = () => fresh.promise;
  view.render(a, ["a"]); view.render(b, ["b"]);
  old.resolve(["a"]); await flush();
  assert.equal(view.render(b, ["b"]).loading, true);
  fresh.resolve(["b"]); await flush();
  const beforeEffects = view.render(a, ["a"], false);
  assert.equal(beforeEffects.data, null);
  assert.equal(beforeEffects.loading, true);
  view.unmount();
});

test("current failure retains only matching data and retry recovers", async () => {
  const view = harness(); let fail = false;
  const loader = async () => { if (fail) throw new Error("API unavailable"); return [1]; };
  view.render(loader, []); await flush(); fail = true;
  await assert.rejects(view.render(loader, []).reload(), /unavailable/);
  assert.deepEqual(view.render(loader, []).data, [1]);
  assert.match(view.render(loader, []).error.message, /unavailable/);
  fail = false; await view.render(loader, []).reload();
  assert.equal(view.render(loader, []).error, null);
  view.unmount();
});

test("unmounted and Strict Mode replay requests cannot commit stale responses", async () => {
  const view = harness(), first = deferred(), second = deferred(); let calls = 0;
  const loader = () => (++calls === 1 ? first.promise : second.promise);
  view.render(loader, []); view.replay();
  second.resolve(["replay"]); await flush(); first.resolve(["original"]); await flush();
  assert.deepEqual(view.render(loader, []).data, ["replay"]);
  const pending = deferred(), finalLoader = () => pending.promise;
  view.render(finalLoader, ["unmount"]); view.unmount(); pending.reject(new Error("late after unmount")); await flush();
});

test("failed refresh keeps the real success time and an acknowledged save supersedes pending reads", async () => {
  const view = harness(); let mode = "ok"; const pending = deferred();
  const loader = async () => { if (mode === "fail") throw new Error("Unavailable"); if (mode === "pending") return pending.promise; return [1]; };
  view.render(loader, []); await flush();
  const original = view.render(loader, []).lastSuccessAt;
  assert.equal(typeof original, "number");
  mode = "fail"; await assert.rejects(view.render(loader, []).reload({ silent: true }));
  assert.equal(view.render(loader, []).lastSuccessAt, original);
  assert.equal(view.render(loader, []).refreshing, false);
  mode = "pending"; const request = view.render(loader, []).reload({ silent: true });
  assert.equal(view.render(loader, []).refreshing, true);
  view.render(loader, []).setData([2]);
  pending.resolve(["old data"]); await request;
  assert.deepEqual(view.render(loader, []).data, [2]);
  view.unmount();
});
