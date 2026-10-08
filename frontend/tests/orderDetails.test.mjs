import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
const file = new URL("../src/hooks/useOrderDetails.js", import.meta.url);
const code = transformSync(readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript" } }, module: { type: "commonjs" } }).code;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

// Tiny injected hook lifecycle harness: no browser/database/dependency needed.
function harness() {
  const slots = [], requests = [];
  let cursor = 0, dirty = false, effects = [], output, args, disposed = false;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, next => { if (disposed) throw new Error("State written after unmount"); slots[index].value = typeof next === "function" ? next(slots[index].value) : next; dirty = true; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect, deps) {
      const index = cursor++, previous = slots[index];
      if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) effects.push(() => {
        previous?.cleanup?.(); slots[index] = { deps, cleanup: effect() };
      });
    },
  };
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(id => id === "react" ? react : { fetchOrderById(orderId, options) { const task = deferred(); requests.push({ id: orderId, ...options, ...task }); return task.promise; } }, mod, mod.exports);
  function render(...nextArgs) {
    if (nextArgs.length) args = nextArgs;
    do { cursor = 0; dirty = false; effects = []; output = mod.exports.useOrderDetails(...args); const pending = effects; effects = []; pending.forEach(run => run()); } while (dirty);
    return output;
  }
  return { render, requests, async flush() { await new Promise(resolve => setImmediate(resolve)); return render(); }, dispose() { slots.forEach(slot => slot?.cleanup?.()); disposed = true; } };
}

test("exact-order loading is independent of list pages; old and cancelled responses cannot overwrite selection", async () => {
  const h = harness(); assert.equal(h.render("a").loading, true);
  const first = h.requests[0];
  assert.equal(h.render("b").data, null); assert.equal(first.signal.aborted, true);
  h.requests[1].resolve({ _id: "b", orderNumber: "B" });
  assert.equal((await h.flush()).data.orderNumber, "B");
  first.resolve({ _id: "a", orderNumber: "A" });
  assert.equal((await h.flush()).data.orderNumber, "B");
  assert.equal(h.render("").data, null);
  h.render("c"); h.dispose();
  h.requests[2].resolve({ _id: "c" }); await new Promise(resolve => setImmediate(resolve));
});

test("refresh, direct links and browser history selection refetch exact IDs without relying on current page", async () => {
  const h = harness(); h.render("outside-page");
  h.requests[0].resolve({ _id: "outside-page" }); await h.flush();
  h.render("another"); h.requests[1].resolve({ _id: "another" }); await h.flush();
  h.render("outside-page"); assert.equal(h.requests[2].id, "outside-page");
  h.requests[2].resolve({ _id: "outside-page" }); const restored = await h.flush();
  restored.reload(); h.render(); assert.equal(h.requests[3].id, "outside-page");
  h.requests[3].resolve({ _id: "outside-page", status: "ready" });
  assert.equal((await h.flush()).data.status, "ready"); h.dispose();
});

test("unavailable/unauthorized details have no leaked data or retry storm; recoverable failures offer Retry", async () => {
  for (const status of [401, 403, 404, 503]) {
    let authCalls = 0; const onUnauthorized = () => authCalls++;
    const h = harness(); h.render("missing", onUnauthorized); h.requests[0].reject({ response: { status } });
    const result = await h.flush();
    assert.equal(result.data, null); assert.equal(result.loading, false); assert.equal(result.retryable, status === 503);
    assert.equal(authCalls, status === 401 ? 1 : 0); assert.equal(h.requests.length, 1);
    if (status === 503) {
      result.reload(); h.render(); assert.equal(h.requests.length, 2);
      h.requests[1].resolve({ _id: "missing" }); assert.equal((await h.flush()).error, null);
    }
    h.dispose();
  }
});
