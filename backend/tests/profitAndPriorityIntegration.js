import assert from "node:assert/strict";
import { test } from "node:test";
import mongoose from "mongoose";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import Order from "../models/Order.js";
import Refund from "../models/Refund.js";
import StockTransaction from "../models/StockTransaction.js";
import Expense from "../models/Expense.js";
import InventoryItem from "../models/InventoryItem.js";
import InventoryBatch from "../models/InventoryBatch.js";
import RestaurantSettings from "../models/RestaurantSettings.js";
import Delivery from "../models/Delivery.js";
import User from "../models/User.js";
import SupplierInvoice from "../models/SupplierInvoice.js";
import { buildProfitReport } from "../services/profitReportingService.js";
import { getAdminOperations } from "../services/adminOperationsService.js";
import expenseRoutes from "../routes/expenseRoutes.js";

// No dotenv or external URI. The helper owns and validates a disposable
// loopback replica-set directory. Every write below is isolated fixture data.
test("profit and dashboard priority integration against owned MongoDB", async t => {
  const previous = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET, RIDER_WORKFLOW_ENABLED: process.env.RIDER_WORKFLOW_ENABLED };
  process.env.NODE_ENV="test";process.env.JWT_SECRET="owned-profit-report-api-fixture";process.env.RIDER_WORKFLOW_ENABLED="false";
  try { await withIsolatedMongo(async()=>{
    const oid=()=>new mongoose.Types.ObjectId(),now=new Date("2026-10-18T12:00:00Z"),minutes=n=>new Date(now.getTime()-n*60000),menu=oid(),ingredient=oid(),first=oid(),second=oid(),debitA=oid(),debitB=oid(),returned=oid(),batchA=oid(),batchB=oid();
    const sale=(id,number,extra={})=>({_id:id,orderNumber:number,source:"pos",status:"delivered",paymentStatus:"paid",paymentMethod:"cash",orderType:"takeaway",totalAmount:100,discountAmount:10,createdAt:now,inventoryStatus:"deducted",items:[{menuItem:menu,name:"Owned meal",quantity:1,price:100}],...extra});
    const movement=(id,order,batch,extra={})=>({_id:id,order,item:ingredient,status:"COMPLETED",movementType:"STOCK_OUT",quantity:2,unitCost:10,occurredAt:now,batchAllocations:[{batch,lotNumber:String(batch),quantity:2,unitCost:10}],sourceDetails:{components:[{type:"menu_recipe",menuItem:menu,ingredientQuantity:2}],lineQuantities:[{index:0,quantity:2}]},...extra});
    await Order.collection.insertMany([sale(first,"TEST-PROFIT-A",{inventoryTransactions:[debitA]}),sale(second,"TEST-PROFIT-B",{totalAmount:80,refundedAmountHalala:2000,refundedAmount:20,inventoryTransactions:[debitB],inventoryRestorationTransactions:[returned]})]);
    await StockTransaction.collection.insertMany([movement(debitA,first,batchA),movement(debitB,second,batchB),movement(returned,second,batchB,{movementType:"STOCK_IN",quantity:1,unitCost:999,batchAllocations:[{batch:batchB,lotNumber:String(batchB),quantity:1,unitCost:999}],sourceDetails:{originalDeduction:debitB}}),movement(oid(),null,oid(),{movementType:"WASTE",quantity:1,batchAllocations:[{batch:oid(),lotNumber:"WASTE",quantity:1,unitCost:5}]}),movement(oid(),null,oid(),{movementType:"PURCHASE_RECEIPT",quantity:1000})]);
    await Refund.collection.insertMany([{_id:oid(),order:second,idempotencyKey:"owned-completed",status:"completed",amountHalala:2000,method:"cash",completedAt:now,restorationTransactions:[returned]},{_id:oid(),order:second,idempotencyKey:"owned-requested",status:"requested",amountHalala:5000,method:"cash",completedAt:null}]);
    await Expense.collection.insertMany([{title:"Archived",totalAmount:100,amountPaid:100,vatAmount:10,recordStatus:"archived",expenseDate:now,source:"operating_expense"},{title:"Cancelled unpaid",totalAmount:100,amountPaid:0,vatAmount:10,recordStatus:"cancelled",expenseDate:now,source:"operating_expense"},{title:"Legacy cancelled partial",totalAmount:100,amountPaid:40,vatAmount:10,recordStatus:"cancelled",expenseDate:now,source:"operating_expense"}]);
    await SupplierInvoice.collection.insertOne({_id:oid(),status:"posted",total:1000,paidAmountHalala:0,dueDate:new Date("2030-01-01"),createdAt:now});
    const read=()=>buildProfitReport({role:"manager",query:{period:"today"},now});
    await t.test("authoritative sales/refunds, original return costs, purchases, waste and archived/cancelled expenses reconcile once",async()=>{
      const result=await read();assert.equal(result.sales.orderedAmount,180);assert.equal(result.sales.completedRefunds,20);assert.equal(result.sales.netSales,160);assert.equal(result.food.recordedCost,30);assert.equal(result.food.missingOrders,0);assert.equal(result.expenses.amount,140);assert.equal(result.waste.recordedCost,5);assert.equal(result.metrics.grossProfit,130);assert.equal(result.metrics.operatingProfit,-15);assert.equal(result.metrics.netProfit,null);assert.equal(result.expenses.vatIncluded,10);
    });
    await t.test("missing order cost and later restock evidence never inflate profit",async()=>{
      const missing=oid();await Order.collection.insertOne(sale(missing,"TEST-MISSING",{totalAmount:50}));let result=await read();assert.equal(result.food.missingOrders,1);assert.equal(result.metrics.grossProfit,null);await Order.collection.deleteOne({_id:missing});
      await Order.collection.updateOne({_id:first},{$set:{inventoryStatus:"restored"}});result=await read();assert.equal(result.food.missingOrders,1);await Order.collection.updateOne({_id:first},{$set:{inventoryStatus:"deducted"}});
    });
    await t.test("platform variance is not commission; custom Riyadh boundaries and channel scope match sales",async()=>{
      const platform=oid();await Order.collection.insertOne(sale(platform,"TEST-PLATFORM",{source:"jahez",deliveryProvider:"jahez",deliveryPaymentType:"aggregator_prepaid",platformTotal:120,totalDifference:20,orderOccurredAt:now,manualEntry:true}));
      const result=await read();assert.equal(result.commissions.amount,null);assert.equal(result.commissions.unreconciledOrders,1);assert.equal(result.platform.pricingVariance,20);assert.equal(result.metrics.operatingProfit,null);assert.equal(result.sales.collectedAmount,180);
      const pos=await buildProfitReport({role:"accountant",query:{period:"custom",from:"2026-10-18",to:"2026-10-18",source:"pos"},now});assert.equal(pos.sales.netSales,160);assert.equal(pos.range.start.toISOString(),"2026-10-17T21:00:00.000Z");assert.equal(pos.metrics.operatingProfit,null);assert.equal(pos.expenses.scope,"restaurant-wide");await Order.collection.deleteOne({_id:platform});
    });
    await t.test("priority sources merge overlapping order reasons, preserve cash meanings, link exact records and drop resolved records",async()=>{
      // Enable only this owned fixture; no production setting/API is accessed.
      await RestaurantSettings.collection.insertOne({key:"default",riderDelivery:{enabled:true}});
      const pending=oid(),ready=oid(),cashOrder=oid(),cashDelivery=oid(),readyDelivery=oid(),stock=oid();
      await Order.collection.insertMany([sale(pending,"TEST-PENDING",{source:"website",status:"pending",paymentStatus:"pending",createdAt:minutes(30),preparationDueAt:minutes(5)}),sale(ready,"TEST-READY",{source:"website",status:"ready",paymentStatus:"pending",orderType:"delivery",deliveryMode:"restaurant",readyAt:minutes(20)}),sale(cashOrder,"TEST-CASH",{source:"website",paymentStatus:"pending",paymentRecords:[],orderType:"delivery",deliveryMode:"restaurant"})]);
      await Delivery.collection.insertMany([{_id:readyDelivery,order:ready,status:"unassigned",createdAt:minutes(25)},{_id:cashDelivery,order:cashOrder,status:"delivered",deliveredAt:minutes(20),cashReport:{status:"discrepancy",amountHalala:1000,balanceAtReportHalala:10000,reportedAt:minutes(15),acknowledgedAt:minutes(10)}}]);
      await InventoryItem.collection.insertOne({_id:stock,name:"Owned blocked stock",sku:"STOCK-OWNED",isActive:true,currentStock:5,reorderLevel:10,tracksExpiry:true,unit:"kg",unitCost:999});
      await InventoryBatch.collection.insertOne({item:stock,remainingQuantity:5,receivedQuantity:5,expiryDate:new Date("2026-10-01"),qualityStatus:"usable",source:"PURCHASE_RECEIPT",unitCost:999});
      let snapshot=await getAdminOperations({role:"manager",now});assert.equal(snapshot.priorityActions.complete,true,JSON.stringify(snapshot.priorityActions.sources));assert.equal(snapshot.priorityActions.total,4);const rows=snapshot.priorityActions.items;
      assert.equal(rows.filter(row=>row.recordNumber==="TEST-PENDING").length,1);assert.equal(rows.find(row=>row.recordNumber==="TEST-PENDING").reasons.length,2);assert.equal(rows.find(row=>row.recordNumber==="TEST-READY").action.label,"Assign rider");
      const cash=rows.find(row=>row.recordNumber==="TEST-CASH");assert.equal(cash.action.label,"Review cash");assert.match(cash.reasons.join(" "),/acknowledged; receipt\/payment still not confirmed/);assert.equal(new URL(cash.action.href,"https://fixture.test").searchParams.get("search"),"TEST-CASH");
      assert.equal(rows.filter(row=>row.key===`stock:${stock}`).length,1);
      let readQueries=0;mongoose.set("debug",()=>readQueries++);await getAdminOperations({role:"manager",now});mongoose.set("debug",false);const smallQueryCount=readQueries;
      const extraStock=Array.from({length:100},(_,index)=>({_id:oid(),sku:`BULK-${index}`,name:`Owned extra ${index}`,isActive:true,currentStock:0,reorderLevel:1,tracksExpiry:false,unit:"kg"}));
      await InventoryItem.collection.insertMany(extraStock);
      readQueries=0;mongoose.set("debug",()=>readQueries++);const bulk=await getAdminOperations({role:"manager",now});mongoose.set("debug",false);assert.ok(readQueries<=smallQueryCount+1,`${readQueries} bulk queries versus ${smallQueryCount} small queries`);assert.equal(bulk.priorityActions.total,104);
      await InventoryItem.collection.deleteMany({_id:{$in:extraStock.map(row=>row._id)}});
      await Delivery.collection.updateOne({_id:cashDelivery},{$set:{"cashReport.status":"confirmed","cashReport.confirmedAt":now}});await Order.collection.updateOne({_id:cashOrder},{$set:{paymentStatus:"paid"}});snapshot=await getAdminOperations({role:"manager",now});assert.equal(snapshot.priorityActions.total,3);assert.equal(snapshot.priorityActions.items.some(row=>row.recordNumber==="TEST-CASH"),false);
      await assert.rejects(getAdminOperations({role:"cashier",now}),error=>error.status===403);
    });
    await t.test("HTTP permission checks and private responses protect combined financial evidence",async()=>{
      const roles=["manager","accountant","cashier"],users=roles.map(role=>({_id:oid(),name:"Owned test user",email:`${role}@fixture.invalid`,role,isActive:true,sessionVersion:0}));await User.collection.insertMany(users);
      const app=express();app.use(express.json());app.use("/api/expenses",expenseRoutes);app.use((error,_req,res,_next)=>res.status(error.status||400).json({success:false,message:error.message}));
      const server=await new Promise(resolve=>{const listener=app.listen(0,"127.0.0.1",()=>resolve(listener));});
      try{for(const user of users){const response=await fetch(`http://127.0.0.1:${server.address().port}/api/expenses/profit-report?period=custom&from=2026-10-18&to=2026-10-18`,{headers:{Authorization:`Bearer ${jwt.sign({id:user._id,sv:0},process.env.JWT_SECRET)}`}});assert.equal(response.status,user.role==="cashier"?403:200);if(response.ok){assert.match(response.headers.get("cache-control"),/private.*no-store/);const body=await response.json();assert.equal(body.data.currency,"SAR");assert.equal(JSON.stringify(body).includes("fixture.invalid"),false);}}}
      finally{await new Promise(resolve=>server.close(resolve));}
    });
  }); } finally { for(const[key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;} }
});
