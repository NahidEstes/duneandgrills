import assert from "node:assert/strict";
import { test } from "node:test";
import { buildProfitCsvRows, buildProfitPrintHtml, profitMetricRows, profitMoney, profitPercent } from "../src/utils/profitReport.js";
import { deliveryQueryFromLink } from "../src/components/admin/delivery/deliveryWorkspace.js";
const fixture = () => ({ generatedAt:"2026-10-18T22:30:00Z", range:{from:"2026-10-18",to:"2026-10-18"}, filters:{source:"all"}, status:"incomplete",
  sales:{orderedAmount:150,grossSales:100,discountTotal:10,completedRefunds:20,voidAmount:0,netSales:80,collectedAmount:100},
  food:{recordedCost:20,estimatedCost:3,partialKnownCost:2,missingOrders:1,estimatedOrders:1}, waste:{recordedCost:5,estimatedCost:0,missingMovements:1,undatedMovements:2}, expenses:{amount:30,vatIncluded:3},commissions:{amount:null},platform:{adjustments:null,pricingVariance:20},
  // Deliberately different from the obvious client-side arithmetic. Exports
  // must render the authoritative value rather than reconstructing a formula.
  metrics:{grossProfit:777,estimatedGrossProfit:null,operatingProfit:null,estimatedOperatingProfit:null,netProfit:null,foodCostPercentage:25,grossMargin:33,operatingMargin:null},cashActivity:{collectedAmount:90,completedRefunds:10,netCollected:80,unknownPaymentDateAmount:12,unknownRefundDateAmount:3},
  channels:[{source:"pos",netSales:80,recordedFoodCost:20,missingOrEstimatedOrders:0,grossProfit:777}],definitions:{grossProfit:"Stored server result only",tax:"VAT basis unverified"},warnings:["Missing data <script> must stay text"],gaps:[{orderNumber:"TEST-ORDER",quality:"missing",reasons:["Missing snapshot"]}],
});
test("screen/export rows preserve server values, missing evidence, discounts and one expense amount",()=>{
 const data=fixture(),rows=profitMetricRows(data),csv=buildProfitCsvRows(data),html=buildProfitPrintHtml(data);
 assert.equal(rows.find(([label])=>label.startsWith("Gross profit:"))[1],777);assert.ok(csv.some(row=>row[0].startsWith("Gross profit:")&&row[1]===777));assert.match(html,/777\.00/);
 assert.ok(csv.some(row=>row[0].includes("Confirmed platform commission")&&row[1]==="Unavailable"));assert.ok(csv.some(row=>row[0].startsWith("Undated historical collections")&&row[1]===12));
 assert.equal(rows.filter(([label])=>label.startsWith("Operating expenses (")).length,1);assert.equal(rows.find(([label])=>label.startsWith("Discounts already included"))[1],10);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/Asia\/Riyadh/);assert.match(html,/not asserted/);assert.match(html,/missing\/estimated orders/i);
 assert.equal(profitMoney(null),"Unavailable");assert.match(profitMoney(0),/0\.00/);assert.equal(profitPercent(null),"Unavailable");
});
test("dashboard delivery links initialize exact record filters without granting cashier active access",()=>{
 const active=deliveryQueryFromLink("workspace=active&search=ORDER-123","manager"),cash=deliveryQueryFromLink("workspace=cash&search=ORDER-456","manager");
 assert.equal(active.workspace,"active");assert.equal(active.search,"ORDER-123");assert.equal(cash.workspace,"cash");assert.equal(cash.dateBasis,"delivered");
 assert.equal(deliveryQueryFromLink("workspace=active&search=ORDER-123","cashier").workspace,"cash");assert.equal(deliveryQueryFromLink("workspace=other","manager").workspace,"active");
});
