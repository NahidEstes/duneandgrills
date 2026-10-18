import assert from "node:assert/strict";
import { test, mock } from "node:test";
import crypto from "node:crypto";
import Order from "../models/Order.js";
import RateLimitBucket from "../models/RateLimitBucket.js";
import { trackGuestOrder } from "../controllers/orderController.js";
import { accountRequestCooldown } from "../controllers/customerAccountController.js";
const response = () => ({ code:200, headers:{}, body:null, set(k,v){this.headers[k]=v;return this;},status(n){this.code=n;return this;},json(value){this.body=value;return this;} });
test("production tracking budgets fail closed when their persistence is unavailable", async () => {
  const original = process.env.NODE_ENV; process.env.NODE_ENV = "production";
  mock.method(RateLimitBucket, "findOneAndUpdate", () => Promise.reject(new Error("isolated database failure")));
  let order = { orderNumber: "DG-OWNED", status: "preparing", items: [] };
  mock.method(Order, "findOne", () => ({ select: async () => order }));
  try {
    for (const found of [true, false]) {
      if (!found) order = null;
      const res = response(); await trackGuestOrder({ ip: "owned-failure-fixture", headers: { "x-order-tracking-token": "private" }, params: { orderNumber: "DG-OWNED" } }, res);
      assert.equal(res.code, 503); assert.equal(res.body.data, undefined);
    }
  } finally { mock.restoreAll(); if (original === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = original; }
});
test("long valid tracking polling survives 15-minute window; failed guesses cannot consume its capability budget",async()=>{
  const original=process.env.NODE_ENV;process.env.NODE_ENV="test";let clock=Date.now();mock.method(Date,"now",()=>clock);
  const token="private-tracking-capability-fixture",hash=crypto.createHash("sha256").update(token).digest("hex");
  mock.method(Order,"findOne",filter=>({select:async()=>filter.trackingTokenHash===hash?{orderNumber:"DG-OWNED",status:"preparing",items:[{name:"Meal",quantity:1,price:25}],orderType:"pickup",totalAmount:25}:null}));
  const request=secret=>({ip:"owned-tracking-fixture",headers:{"x-order-tracking-token":secret},params:{orderNumber:"DG-OWNED"}});
  try {
    for(let n=0;n<100;n++){const res=response();await trackGuestOrder(request(token),res);assert.equal(res.code,200);assert.equal(res.headers["Cache-Control"],"private, no-store");assert.ok(!JSON.stringify(res.body).includes(token));clock+=10_000;}
    for(let n=0;n<31;n++){const res=response();await trackGuestOrder(request("wrong"),res);assert.equal(res.code,n<30?404:429);if(n===30)assert.ok(Number(res.headers["Retry-After"])>0);}
    const valid=response();await trackGuestOrder(request(token),valid);assert.equal(valid.code,200);
    let rateLimited=false;for(let n=0;n<20;n++){const res=response();await trackGuestOrder(request(token),res);if(res.code===429){rateLimited=true;assert.ok(Number(res.headers["Retry-After"])>0);}}
    assert.ok(rateLimited,"Valid tokens still have an anti-flood budget");
  } finally {mock.restoreAll();if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;}
});
test("account resend cooldown follows normalized email across addresses without disclosing existence",async()=>{
  const original=process.env.NODE_ENV;process.env.NODE_ENV="test";
  try{let next=0;const first=response();accountRequestCooldown({ip:"one",body:{email:"Owned-Cooldown@Example.Test"}},first,()=>next++);assert.equal(next,1);const second=response();accountRequestCooldown({ip:"two",body:{email:"owned-cooldown@example.test"}},second,()=>next++);assert.equal(next,1);assert.equal(second.code,429);assert.ok(Number(second.headers["Retry-After"])>0);}finally{if(original===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=original;}
});
