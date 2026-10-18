import assert from "node:assert/strict";
import { test } from "node:test";
import { actionDestination, inventoryPriorityActions, orderDeliveryActionStages, prioritySort } from "../services/adminPriorityActionsService.js";
const settings = { preparation: { pendingAttentionMinutes: 5 }, riderDelivery: { enabled: true } }, now = new Date("2026-10-18T12:00:00Z");
test("priority actions use exact authorized records and preserve cash versus assignment workspaces", () => {
  for (const [actionRank, workspace, label] of [[1,"cash","Review cash"],[2,"active","Assign rider"],[3,"active","Review delivery"]]) {
    const action = actionDestination({ deliveryId: "delivery", recordId: "order", orderNumber: "TEST & ORDER", actionRank });
    const url = new URL(action.href, "https://fixture.test"); assert.equal(url.searchParams.get("workspace"), workspace); assert.equal(url.searchParams.get("search"), "TEST & ORDER"); assert.equal(action.label, label);
  }
  assert.equal(new URL(actionDestination({ recordId: "abc" }).href,"https://fixture.test").searchParams.get("order"),"abc");
});
test("one stock record combines low/out/blocked/expiry reasons without invented onset or mutations", () => {
  const rows = inventoryPriorityActions({ rows: [{ _id: "item", sku: "INV-TEST", name: "Fixture item", stockHealth: { out: true, blocked: true, expiring: true }, blockedReasons: ["expired"] }] });
  assert.equal(rows.length, 1); assert.equal(rows[0].priority, 0); assert.equal(rows[0].reasons.length, 3); assert.equal(rows[0].since, null); assert.equal(new URL(rows[0].action.href,"https://fixture.test").searchParams.get("edit"),"item");
  assert.equal([rows[0],{key:"other",priority:2}].sort(prioritySort)[0].key,"stock:item");
});
test("delivery pipeline is permission/enablement gated, groups orders once, and distinguishes acknowledgement from receipt", () => {
  const enabled = orderDeliveryActionStages({ role: "manager", settings, now }), disabled = orderDeliveryActionStages({role:"manager",settings:{...settings,riderDelivery:{enabled:false}},now});
  assert.ok(enabled.some(stage=>stage.$unionWith)); assert.equal(disabled.some(stage=>stage.$unionWith),false);
  assert.equal(orderDeliveryActionStages({role:"accountant",settings,now}).some(stage=>stage.$unionWith),false);
  const group = enabled.find(stage=>stage.$group); assert.equal(group.$group._id,"$key");
  const text=JSON.stringify(enabled);assert.match(text,/Cash discrepancy acknowledged; receipt\/payment still not confirmed/);assert.match(text,/Rider reported collection; cashier receipt is not confirmed/);assert.ok(!text.includes('"$merge"')&&!text.includes('"$out"'));
});
