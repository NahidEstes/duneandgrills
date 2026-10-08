import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url), { transformSync } = require("next/dist/build/swc");
const file = new URL("../src/hooks/useOrderDialog.js", import.meta.url);
const code = transformSync(readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript" } }, module: { type: "commonjs" } }).code;

test("order dialog supports Escape, traps Tab/Shift-Tab, restores focus and removes listeners", () => {
  const original = globalThis.document;
  let handler, removed = false, closed = 0;
  const element = () => ({ isConnected: true, focus() { document.activeElement = this; }, getClientRects: () => [1] });
  const previous = element(), first = element(), last = element();
  const node = { ...element(), querySelectorAll: () => [first, last], addEventListener(_event, listener) { handler = listener; }, removeEventListener(_event, listener) { removed = listener === handler; } };
  globalThis.document = { activeElement: previous };
  const effects = [], refs = [];
  const react = { useRef(value) { const ref = { current: value }; refs.push(ref); return ref; }, useEffect(effect) { effects.push(effect); } };
  const mod = { exports: {} };
  try {
    new Function("require", "module", "exports", code)(() => react, mod, mod.exports);
    const ref = mod.exports.useOrderDialog(() => closed++); ref.current = node;
    const cleanups = effects.map(effect => effect());
    assert.equal(document.activeElement, node);
    const press = (key, shiftKey = false, defaultPrevented = false) => { const event = { key, shiftKey, defaultPrevented, preventDefault() { this.defaultPrevented = true; } }; handler(event); return event; };
    assert.equal(press("Tab").defaultPrevented, true); assert.equal(document.activeElement, first);
    document.activeElement = last; press("Tab"); assert.equal(document.activeElement, first);
    press("Tab", true); assert.equal(document.activeElement, last);
    press("Escape", false, true); assert.equal(closed, 0);
    assert.equal(press("Escape").defaultPrevented, true); assert.equal(closed, 1);
    cleanups.forEach(cleanup => cleanup?.()); assert.equal(removed, true); assert.equal(document.activeElement, previous);
  } finally { globalThis.document = original; }
});
