import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { isThemedWorkspace, normalizeWorkspaceTheme, workspaceThemeBootstrap } from "../src/theme/workspaceTheme.js";

function bootstrap(pathname, saved, blocked = false) {
  const document = { documentElement: { dataset: {} } };
  vm.runInNewContext(workspaceThemeBootstrap, { location: { pathname }, document, localStorage: { getItem: () => { if (blocked) throw Error("Blocked"); return saved; } } });
  return document.documentElement.dataset.workspaceTheme;
}
test("new or invalid preferences always use the original dark mode", () => {
  for (const value of [null, undefined, "", "system", "LIGHT", "invalid", "dark"]) {
    assert.equal(normalizeWorkspaceTheme(value), "dark");
    assert.equal(bootstrap("/admin", value), "dark");
    assert.equal(bootstrap("/inventory/recipes", value), "dark");
  }
});
test("explicit light preference restores before paint for both workspaces", () => {
  for (const path of ["/admin", "/admin/expenses", "/inventory", "/inventory/preparation-recipes"]) {
    assert.equal(isThemedWorkspace(path), true); assert.equal(bootstrap(path, "light"), "light");
  }
});
test("light preference cannot change public pages or other staff portals", () => {
  for (const path of ["/", "/menu", "/login", "/pos", "/kitchen", "/rider", "/administrator", "/inventory-other"]) {
    assert.equal(isThemedWorkspace(path), false); assert.equal(bootstrap(path, "light"), undefined);
  }
});
test("blocked storage safely defaults dark without breaking the page", () => {
  assert.equal(bootstrap("/admin", null, true), "dark");
  assert.equal(bootstrap("/menu", null, true), undefined);
});
