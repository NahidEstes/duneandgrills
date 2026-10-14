import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { cartConfigurationKey, replaceCartConfiguration } from "../src/utils/cartEditing.js";
import { lockCustomerScroll } from "../src/utils/customerDialog.js";
const read = path => readFile(new URL(path, import.meta.url), "utf8");
test("configured cart editing addresses one line, keeps quantity and never merges different choices", () => {
  const a = { _id: "dish", quantity: 3, selectedAddOns: [{ _id: "sauce", quantity: 2 }], spiceLevel: "medium", note: "old", cartLineId: "A" }; a.customizationKey = cartConfigurationKey(a);
  const b = { ...a, cartLineId: "B", spiceLevel: "hot" }; b.customizationKey = cartConfigurationKey(b);
  const next = replaceCartConfiguration([a, b], a, { ...a, note: "new", price: 23 });
  assert.equal(next[0].cartLineId, "A"); assert.equal(next[0].quantity, 3); assert.equal(next[0].selectedAddOns[0].quantity, 2); assert.equal(next[1], b);
  assert.throws(() => replaceCartConfiguration([a,b],a,b), /already in your cart/);
  assert.throws(() => replaceCartConfiguration([{...a,quantity:4},b],a,{...a,note:"new"}), /changed/);
  assert.throws(() => replaceCartConfiguration([a],{...a,isReward:true},a), /cannot be customized/);
  assert.throws(() => replaceCartConfiguration([a],a,{...a,quantity:100}), /1 to 99/);
});
test("guest/legacy identities and canonical add-on quantities prevent accidental duplicate edits", () => {
  const a = { _id: "dish", customizationKey: "legacy", quantity: 1, selectedAddOns: [{_id:"B",quantity:2},{_id:"A",quantity:1}] };
  const b = { ...a, customizationKey: "other", selectedAddOns: [...a.selectedAddOns].reverse() };
  assert.equal(cartConfigurationKey(a), cartConfigurationKey(b));
  assert.throws(() => replaceCartConfiguration([a,b],a,a), /already in your cart/);
});
test("nested dialogs retain the original body lock regardless of close order", () => {
  const body = { style: { overflow: "auto" } };
  const parent = lockCustomerScroll(body), child = lockCustomerScroll(body);
  parent(); assert.equal(body.style.overflow,"hidden"); child(); assert.equal(body.style.overflow,"auto"); child(); assert.equal(body.style.overflow,"auto");
});
test("public destinations are real, cross-page anchors wait for DOM instead of a timer", async () => {
  const nav = await read("../src/components/Navbar.jsx"), footer = await read("../src/components/LandingFooter.jsx"), anchors = await read("../src/components/PublicHashNavigation.jsx");
  assert.match(nav,/href: "\/menu"/); assert.match(nav,/label: "Contact", hash: "visit"/); assert.doesNotMatch(nav,/setTimeout|scrollToSection/);
  assert.match(anchors,/MutationObserver/); assert.match(nav,/aria-expanded=\{mobileOpen\}/); assert.match(nav,/aria-controls="public-mobile-navigation"/);
  assert.doesNotMatch(footer,/https:\/\/(www\.)?(instagram|facebook|x)\.com|href="#"|Privacy Policy|Terms of Service|type="email"/);
  assert.match(footer,/"Contact","\/#visit"/);
});
test("named native dialogs hide closed cart controls and retain pending order protections", async () => {
  const cart = await read("../src/components/CartDrawer.jsx"), item = await read("../src/components/ItemModal.jsx"), login = await read("../src/components/LoginPromptModal.jsx"), hook = await read("../src/hooks/useCustomerDialog.js");
  for (const source of [cart,item,login]) { assert.match(source,/<dialog/); assert.match(source,/aria-modal="true"/); assert.match(source,/aria-labelledby=/); assert.match(source,/onCancel=/); }
  assert.match(cart,/open \? "flex" : "hidden"/); assert.match(hook,/node.showModal\(\)/); assert.match(hook,/previous.focus\(\)/);
  assert.match(cart,/if \(!submitting\)/); assert.match(cart,/submitLock.current/); assert.match(cart,/submittedActor !== actorRef.current/); assert.match(cart,/submittedCart === JSON.stringify\(cartSnapshot.current\)/);
  assert.doesNotMatch(cart,/API server is running|Reconcile \/ retry|Stop unresolved request \/|get a call to confirm/);
  assert.match(cart,/Check original order/); assert.match(cart,/does not cancel an existing order/);
});
test("persistent form labels, autocomplete and editable visual styles", async () => {
  const auth = await read("../src/components/AuthPage.jsx"), login = await read("../src/components/LoginPromptModal.jsx"), cart = await read("../src/components/CartDrawer.jsx");
  for (const source of [auth,login]) { assert.match(source,/htmlFor=/); assert.match(source,/autoComplete=/); assert.match(source,/aria-describedby=/); assert.match(source,/role="alert"/); }
  assert.match(auth,/type="tel"/); assert.match(cart,/id="checkout-phone" type="tel"/); assert.doesNotMatch(cart,/text-neutral-300 cursor-not-allowed/);
});
test("menu counts, explicit reset and home retry use existing local filters", async () => {
  const menu = await read("../src/components/FullMenuPage.jsx"), home = await read("../src/components/MenuSection.jsx");
  assert.match(menu,/matching/); assert.match(menu,/Clear filters/); assert.match(menu,/Reset menu filters/); assert.match(menu,/aria-pressed=\{activeCategory === cat\}/);
  assert.match(menu,/filterMenu\(items/); assert.match(home,/Retry menu/); assert.match(home,/!items.length/);
});
test("public installation controls use layout slots rather than covering customer actions; staff stays floating", async () => {
  const provider = await read("../app/providers.jsx"), pwa = await read("../src/components/pwa/PwaExperience.jsx"), footer = await read("../src/components/LandingFooter.jsx"), auth = await read("../src/components/AuthPage.jsx");
  assert.match(provider, /PwaExperience inlineOptions=/);
  assert.match(pwa, /inlineOptions = false/);
  assert.match(pwa, /createPortal\(options, optionsTarget\)/);
  for (const source of [footer,auth]) assert.match(source, /id="public-app-options"/);
});
