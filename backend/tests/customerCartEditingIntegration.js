import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import { withIsolatedMongo } from "./helpers/isolatedMongo.js";
import User from "../models/User.js";
import MenuItem from "../models/MenuItem.js";
import MenuAddOn from "../models/MenuAddOn.js";
import UserCart from "../models/UserCart.js";
import Order from "../models/Order.js";
import StockTransaction from "../models/StockTransaction.js";
import cartRoutes from "../routes/cartRoutes.js";

test("customer cart configuration edits use existing catalog/pricing and exact own lines in isolated Mongo", async t => {
  const keys = ["NODE_ENV","JWT_SECRET"], saved = Object.fromEntries(keys.map(key => [key,process.env[key]]));
  try { await withIsolatedMongo(async () => {
    process.env.NODE_ENV="test"; process.env.JWT_SECRET="owned-customer-cart-test-only";
    const owner=await User.create({name:"Local customer",email:"customer@cart.invalid",password:"LocalDummy123!",role:"customer"});
    const other=await User.create({name:"Other customer",email:"other@cart.invalid",password:"LocalDummy123!",role:"customer"});
    const dish=await MenuItem.create({name:"Dummy burger",description:"Isolated fixture",category:"Food",image:"/logo.jpeg",price:20,customization:{enabled:true,spice:{enabled:true,options:["medium","hot"],default:"medium"}}});
    const addOn=await MenuAddOn.create({name:"Dummy extra",price:3,menuItems:[dish._id]});
    const app=express(); app.use(express.json()); app.use("/api/cart",cartRoutes);
    const server=app.listen(0,"127.0.0.1"); await new Promise(resolve=>server.once("listening",resolve));
    const call=async(method,path="",body,actor=owner)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/cart${path}`,{method,headers:{"Content-Type":"application/json",...(actor?{Authorization:`Bearer ${jwt.sign({id:actor._id,sv:0},process.env.JWT_SECRET)}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
    const added=await call("POST","",{productId:String(dish._id),quantity:3,customization:{spiceLevel:"medium",note:"original"}});
    assert.equal(added.status,201); const original=added.body.data[0];
    const path=`/${dish._id}?productType=menuItem&lineId=${original.cartLineId}`;
    const payload={quantity:3,expectedCustomizationKey:original.customizationKey,expectedQuantity:3,customization:{selectedAddOns:[{id:String(addOn._id),quantity:2}],spiceLevel:"hot",note:"edited"},price:0.01};
    try {
      await t.test("replaces the exact line and preserves quantity with authoritative add-on prices",async()=>{
        const edited=await call("PATCH",path,payload); assert.equal(edited.status,200,JSON.stringify(edited.body));
        assert.equal(edited.body.data.length,1); assert.equal(edited.body.data[0].cartLineId,original.cartLineId); assert.equal(edited.body.data[0].quantity,3); assert.equal(edited.body.data[0].price,26); assert.equal(edited.body.data[0].selectedAddOns[0].quantity,2);
      });
      await t.test("stale edit and cross-customer/unauthenticated requests cannot change another line",async()=>{
        assert.equal((await call("PATCH",path,payload)).status,409); assert.equal((await call("PATCH",path,payload,other)).status,404); assert.equal((await call("PATCH",path,payload,null)).status,401);
      });
      const current=(await call("GET")).body.data[0];
      const body={...payload,expectedCustomizationKey:current.customizationKey,expectedQuantity:current.quantity};
      await t.test("inactive add-on and invalid quantities fail without dropping the original cart",async()=>{
        await MenuAddOn.updateOne({_id:addOn._id},{$set:{isActive:false}});
        assert.equal((await call("PATCH",path,body)).status,409);
        const stored=await UserCart.findOne({userId:owner._id}); assert.equal(stored.items[0].quantity,3); assert.equal(stored.items[0].note,"edited");
        assert.equal((await call("PATCH",path,{...body,quantity:100})).status,400);
        await MenuAddOn.updateOne({_id:addOn._id},{$set:{isActive:true}});
      });
      await t.test("identical configurations cannot silently merge and concurrent edits claim one revision",async()=>{
        const second=await call("POST","",{productId:String(dish._id),quantity:1,customization:{spiceLevel:"medium",note:"second"}}); assert.equal(second.status,201);
        assert.equal((await call("PATCH",path,{...body,customization:{spiceLevel:"medium",note:"second"}})).status,409);
        const results=await Promise.all([call("PATCH",path,{...body,customization:{spiceLevel:"hot",note:"A"}}),call("PATCH",path,{...body,customization:{spiceLevel:"hot",note:"B"}})]);
        assert.equal(results.filter(row=>row.status===200).length,1); assert.equal(results.filter(row=>row.status===409).length,1);
        const cart=(await call("GET")).body.data; assert.equal(cart.length,2); assert.equal(cart.find(row=>row.note==="second").quantity,1);
        assert.equal(await Order.countDocuments(),0); assert.equal(await StockTransaction.countDocuments(),0);
      });
      await t.test("legacy quantity-only PATCH remains supported",async()=>{
        const result=await call("PATCH",path,{quantity:4}); assert.equal(result.status,200); assert.equal(result.body.data.find(row=>row.cartLineId===original.cartLineId).quantity,4);
      });
    } finally {await new Promise(resolve=>server.close(resolve));}
  }); } finally {for(const key of keys){if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];}}
});
