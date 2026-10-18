import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
// Owned HTTP fixtures + production Next. No actual application backend, email
// provider, .env, cloud database or production settings are used by this script.
const root=path.resolve(import.meta.dirname,".."), output=await mkdtemp(path.join(tmpdir(),"dg-customer-features-"));
const image=await readFile(path.join(root,"public/logo.jpeg"));
const product={_id:"222222222222222222222222",name:"Original burger",description:"Original description",translations:{en:{name:"Grilled burger",description:"Grilled beef with house sauce."},ar:{name:"برجر مشوي",description:"لحم مشوي مع صلصة المطعم."}},image:"/logo.jpeg",price:24,category:"Burgers",isAvailable:true,customization:{enabled:true,spice:{enabled:true,options:["medium","hot"],default:"medium"}},addOns:[]};
const customer={_id:"111111111111111111111111",name:"Fixture Customer",email:"customer@example.test",phone:"0500000000",address:"Fixture address",role:"customer",pointsBalance:0,emailVerificationRequired:false,emailVerifiedAt:null,createdAt:"2026-09-01T12:00:00Z"};
const config={websiteOrderingEnabled:true,defaultOrderType:"pickup",minimumDeliveryOrder:0,orderTypes:[{value:"pickup",label:"Pickup",deliveryFee:0}]};
const settings={timezone:"Asia/Riyadh",location:{address:"Fixture restaurant address",city:"Riyadh",country:"Saudi Arabia",phone:"+966500000000"},openingHours:[],receipt:{},orders:{channels:{website:true}}};
let calls=[],signed=false,emailConfigured=true,trackStatus="preparing",throttle=false,resetUsed=false,verifyUsed=false,pendingAccount=false;
const trackingToken="owned-private-tracking-fixture",resetToken="a".repeat(64),verifyToken="b".repeat(64);
const fixture=createServer(async(req,res)=>{
 const url=new URL(req.url,"http://127.0.0.1"),resource=url.pathname.replace(/^\/api/,"");let body={};if(!["GET","HEAD"].includes(req.method)){let raw="";for await(const chunk of req)raw+=chunk;body=raw?JSON.parse(raw):{};}
 calls.push({resource,method:req.method,body,url:req.url,trackingHeader:req.headers["x-order-tracking-token"]});let status=200,payload={success:true,data:[]};
 if(resource==="/menu")payload.data=[product];else if(resource===`/menu/${product._id}`)payload.data=product;
 else if(resource==="/categories")payload.data=[{name:"Burgers",type:"menu",isActive:true}];
 else if(resource==="/settings/public")payload.data=settings;else if(resource==="/orders/config")payload.data=config;
 else if(["/auth/me","/auth/session"].includes(resource)){if(signed)payload={success:true,user:{...customer,emailVerificationRequired:pendingAccount}};else{status=401;payload={success:false,message:"Not authenticated"};}}
 else if(resource==="/auth/login"){signed=true;res.setHeader("Set-Cookie",["dg_session=owned-customer; Path=/; HttpOnly; SameSite=Lax","dg_csrf=owned-csrf; Path=/; SameSite=Lax"]);payload={success:true,user:customer};}
 else if(resource==="/auth/register"){signed=true;pendingAccount=true;status=201;res.setHeader("Set-Cookie",["dg_session=owned-customer; Path=/; HttpOnly; SameSite=Lax","dg_csrf=owned-csrf; Path=/; SameSite=Lax"]);payload={success:true,emailDelivery:"queued",user:{...customer,emailVerificationRequired:true}};}
 else if(resource==="/auth/logout"){signed=false;payload={success:true};}
 else if(resource==="/cart")payload.data={items:[],coupon:null};
 else if(resource==="/profile/dashboard")payload.data={user:customer,stats:{orders:0,favorites:0,pointsBalance:0,reviews:0},orders:[],recentOrders:[],favorites:[],addresses:[],paymentMethods:[],reviews:[]};
 else if(resource==="/rewards/me")payload.data={pointsBalance:0,milestones:[],availableRewards:[],pointTransactions:[],redemptions:[]};
 else if(resource==="/auth/email-availability")payload.data={configured:emailConfigured};
 else if(["/auth/forgot-password","/auth/resend-verification"].includes(resource)){status=emailConfigured?202:503;payload=emailConfigured?{success:true,retryAfterSeconds:60,message:"If this customer account is eligible, an email request has been queued. This does not confirm delivery. Check your inbox; request another link if none arrives."}:{success:false,message:"Account email is currently unavailable. Contact the restaurant or try again later."};}
 else if(resource==="/auth/reset-password"){if(resetUsed||body.token!==resetToken){status=400;payload={success:false,message:"This link is invalid, expired or already used. Request a new link."};}else{resetUsed=true;signed=false;payload={success:true,message:"Password reset. Sign in again with your new password."};}}
 else if(resource==="/auth/verify-email"){if(verifyUsed||body.token!==verifyToken){status=400;payload={success:false,message:"This link is invalid, expired or already used. Request a new link."};}else{verifyUsed=true;payload={success:true,message:"Email verified. You can return to your account."};}}
 else if(resource.startsWith("/orders/track/")){if(throttle){status=429;res.setHeader("Retry-After","30");payload={success:false,message:"Too many requests. Please try again later."};}else if(req.headers["x-order-tracking-token"]!==trackingToken){status=404;payload={success:false,message:"Order could not be found"};}else payload.data={orderNumber:"TEST-CUSTOMER-ORDER",status:trackStatus,items:[{...product,quantity:1}],totalAmount:24};}
 else if(resource==="/offers/validate-coupon"){status=400;payload={success:false,message:"This coupon could not be applied."};}
 else if(!["GET","HEAD"].includes(req.method)){status=400;payload={success:false,message:"Unexpected isolated mutation"};}
 res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"private, no-store"});res.end(JSON.stringify(payload));
});
await new Promise(resolve=>fixture.listen(0,"127.0.0.1",resolve));
const probe=createServer();await new Promise(resolve=>probe.listen(0,"127.0.0.1",resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const origin=`http://127.0.0.1:${port}`,env={...process.env,NODE_ENV:"production",SITE_URL:origin,SITE_ENV:"staging",BACKEND_API_URL:`http://127.0.0.1:${fixture.address().port}/api`};
for(const key of Object.keys(env))if(/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|RESEND|CUSTOMER_EMAIL|TOKEN_SECRET/i.test(key))delete env[key];
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(port)],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});let log="",browser;
server.stdout.on("data",value=>{log+=value;});server.stderr.on("data",value=>{log+=value;});
try{
 for(let attempt=0;attempt<100;attempt++){try{await fetch(origin+"/login");break;}catch{if(server.exitCode!=null)throw new Error(log);await new Promise(resolve=>setTimeout(resolve,200));}}
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE,"index.mjs")).href:"playwright");browser=await chromium.launch({channel:"chrome",headless:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:760}]){
  signed=false;emailConfigured=true;trackStatus="preparing";throttle=false;resetUsed=false;verifyUsed=false;pendingAccount=false;calls=[];
  const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
  await context.route("**/_next/image**",route=>route.fulfill({contentType:"image/jpeg",body:image}));
  await context.route("https://**",route=>route.fulfill({status:200,body:""}));
  const direction=async value=>page.waitForFunction(value=>document.documentElement.dir===value,value);
  const toggle=async(scope=page)=>{await scope.locator(".customer-language-switch").first().click();};
  const shot=async label=>{await page.screenshot({path:path.join(output,`${label}-${viewport.width}.png`),fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${label} ${viewport.width}`);};
  await page.goto(origin+"/");await page.getByRole("heading",{name:/FLAVOR FORGED/}).waitFor();await page.screenshot({path:path.join(output,`home-en-${viewport.width}.png`),animations:"disabled"});await toggle();await direction("rtl");await page.getByRole("heading",{name:/نكهة صاغتها/}).waitFor();await page.screenshot({path:path.join(output,`home-ar-${viewport.width}.png`),animations:"disabled"});
  await page.goto(origin+"/menu");await direction("rtl");await page.getByRole("heading",{name:"برجر مشوي",exact:true}).waitFor();await shot("menu-ar");await toggle();await direction("ltr");await page.getByRole("heading",{name:"Grilled burger",exact:true}).waitFor();await shot("menu-en");
  await page.goto(`${origin}/item/${product._id}`);const item=page.locator('dialog[aria-labelledby="customization-title"]');await item.waitFor({state:"visible"});await page.getByRole("button",{name:"Increase quantity",exact:true}).click();
  const note=item.locator("textarea");await note.fill("Keep this note / احتفظ بالملاحظة");await shot("item-en");await toggle(item);await direction("rtl");assert.equal(await note.inputValue(),"Keep this note / احتفظ بالملاحظة");await page.getByRole("heading",{name:"برجر مشوي",exact:true}).waitFor();await shot("item-ar");
  await item.getByRole("button",{name:/أضف.*السلة/}).last().click();await page.waitForURL("**/menu");await page.getByRole("button",{name:/افتح السلة/}).click();const cart=page.locator('dialog[aria-labelledby="customer-cart-title"]');await cart.waitFor({state:"visible"});await shot("cart-ar");
  await toggle(cart);await direction("ltr");await cart.getByText("Grilled burger",{exact:true}).waitFor();await shot("cart-en");await cart.getByRole("button",{name:"Proceed to Checkout",exact:true}).click();
  await page.locator("#checkout-name").fill("Guest unchanged");await page.locator("#checkout-phone").fill("0501234567");await shot("checkout-en");await toggle(cart);await direction("rtl");assert.equal(await page.locator("#checkout-name").inputValue(),"Guest unchanged");assert.equal(await page.locator("#checkout-phone").inputValue(),"0501234567");await shot("checkout-ar");
  assert.equal(calls.some(c=>c.resource==="/orders"&&c.method==="POST"),false,"Language switch must never submit an order");
  await page.goto(origin+"/login");await direction("rtl");await page.locator("#auth-email").fill(customer.email);await page.locator("#auth-password").fill("FixturePass123!");await shot("login-ar");await toggle();await direction("ltr");assert.equal(await page.locator("#auth-email").inputValue(),customer.email);assert.equal(await page.locator("#auth-password").inputValue(),"FixturePass123!");await shot("login-en");
  await page.getByRole("button",{name:"Log In",exact:true}).click();await page.waitForURL(origin+"/");await page.goto(origin+"/profile");await page.getByRole("heading",{name:"Recent Orders",exact:true}).waitFor();await shot("profile-en");await toggle();await direction("rtl");await page.getByRole("heading",{name:"الطلبات الأخيرة",exact:true}).waitFor();await shot("profile-ar");
  await page.goto(origin+"/menu?track=TEST-CUSTOMER-ORDER");await page.getByText("رمز التتبع الخاص",{exact:true}).waitFor();const tracker=page.locator("#guest-tracking-content");await tracker.locator('input[type=password]').fill(trackingToken);await tracker.getByRole("button",{name:"تتبع الطلب",exact:true}).click();await page.getByText("TEST-CUSTOMER-ORDER",{exact:true}).waitFor();await shot("tracking-ar");await toggle();await direction("ltr");assert.equal(await tracker.locator('input[type=password]').inputValue(),trackingToken);await shot("tracking-en");assert.ok(!page.url().includes(trackingToken));assert.ok(calls.filter(c=>c.resource.startsWith("/orders/track/")).every(c=>!c.url.includes(trackingToken)&&c.trackingHeader===trackingToken));
  await page.goto(origin+"/forgot-password");await page.getByLabel("Email",{exact:true}).fill(customer.email);await shot("forgot-en");await toggle();await direction("rtl");assert.equal(await page.locator('input[type=email]').inputValue(),customer.email);await shot("forgot-ar");await page.getByRole("button",{name:"طلب إعادة تعيين كلمة المرور",exact:true}).click();await page.getByRole("status").filter({hasText:/لا يؤكد وصولها/}).waitFor();assert.equal(calls.filter(c=>c.resource==="/auth/forgot-password").at(-1).body.language,"ar");
  await page.goto(`${origin}/reset-password#token=${resetToken}`);await page.waitForFunction(()=>!location.hash);assert.equal(calls.filter(c=>c.resource==="/auth/reset-password").length,0);await page.locator('input[type=password]').nth(0).fill("NewFixturePass123!");await page.locator('input[type=password]').nth(1).fill("NewFixturePass123!");await shot("reset-ar");await toggle();await direction("ltr");assert.equal(await page.locator('input[type=password]').first().inputValue(),"NewFixturePass123!");await shot("reset-en");await page.getByRole("button",{name:"Reset password",exact:true}).click();await page.getByRole("status").filter({hasText:/Password reset/}).waitFor();
  await page.goto(`${origin}/reset-password#token=${resetToken}`);await page.locator('input[type=password]').first().fill("OtherFixturePass123!");await page.locator('input[type=password]').nth(1).fill("OtherFixturePass123!");await page.getByRole("button",{name:"Reset password",exact:true}).click();await page.getByRole("alert").filter({hasText:/invalid, expired or already used/}).waitFor();await page.getByRole("link",{name:"Request a new link",exact:true}).waitFor();
  await page.goto(`${origin}/verify-email#token=${verifyToken}`);await page.waitForFunction(()=>!location.hash);assert.equal(calls.filter(c=>c.resource==="/auth/verify-email").length,0);await page.getByRole("button",{name:"Confirm email verification",exact:true}).click();await page.getByRole("status").filter({hasText:/Email verified/}).waitFor();
  emailConfigured=false;await page.goto(origin+"/verification-pending");await page.getByRole("alert").filter({hasText:/currently unavailable/}).waitFor();await shot("verification-unavailable-en");await toggle();await direction("rtl");await page.getByRole("alert").filter({hasText:/غير متاحة/}).waitFor();await shot("verification-unavailable-ar");assert.equal(await page.getByRole("button",{name:"طلب رسالة التأكيد",exact:true}).isDisabled(),true);
  await page.addScriptTag({path:path.join(root,"node_modules/axe-core/axe.min.js")});const violations=await page.evaluate(async()=> (await window.axe.run(document.querySelector("main"),{runOnly:{type:"tag",values:["wcag2a","wcag2aa"]}})).violations.map(v=>v.id));assert.deepEqual(violations,[]);
  emailConfigured=true;await page.goto(origin+"/login");await toggle();await direction("ltr");await page.getByRole("button",{name:"Sign up",exact:true}).click();await page.locator("#auth-name").fill("Signup unchanged");await page.locator("#auth-email").fill("signup@example.test");await page.locator("#auth-password").fill("SignupFixture123!");await page.locator("#auth-phone").fill("0501111111");await shot("register-en");await toggle();await direction("rtl");assert.equal(await page.locator("#auth-name").inputValue(),"Signup unchanged");assert.equal(await page.locator("#auth-phone").inputValue(),"0501111111");await shot("register-ar");await page.locator('button[type="submit"]').click();await page.waitForURL("**/verification-pending");await page.getByRole("button",{name:"طلب رسالة التأكيد",exact:true}).waitFor();await shot("pending-ar");await toggle();await direction("ltr");await shot("pending-en");await page.getByRole("button",{name:"Request verification email",exact:true}).click();await page.getByRole("status").filter({hasText:/email request has been queued/}).waitFor();
  await toggle();await direction("rtl");await page.goto(origin+"/pos/customer-display");await direction("ltr");assert.equal(await page.locator("html").getAttribute("lang"),"en");assert.equal(await page.evaluate(()=>localStorage.getItem("dg.language.v1")),"ar");
  assert.deepEqual(errors,[]);assert.ok(calls.every(c=>!c.url.includes(resetToken)&&!c.url.includes(verifyToken)));await context.close();console.log(`PASS customer English/Arabic + RTL/LTR, form/cart/session retention, signup/verification, tracking privacy, account links, unavailable email and POS locale isolation: ${viewport.width}px`);
 }
 const recoveryContext = await browser.newContext({viewport:{width:390,height:844}}), recovery = await recoveryContext.newPage();
 await recoveryContext.route("**/_next/image**",route=>route.fulfill({contentType:"image/jpeg",body:image}));
 await recoveryContext.route("https://**",route=>route.fulfill({status:200,body:""}));
 await recovery.clock.install(); calls=[]; signed=false; trackStatus="preparing"; throttle=false;
 await recovery.goto(origin+"/menu?track=TEST-CUSTOMER-ORDER");
 const tracker = recovery.locator("#guest-tracking-content"), trackingCalls = () => calls.filter(c=>c.resource.startsWith("/orders/track/")).length;
 await tracker.locator('input[type=password]').fill(trackingToken);await tracker.getByRole("button",{name:"Track order",exact:true}).click();await recovery.getByText("TEST-CUSTOMER-ORDER",{exact:true}).waitFor();
 throttle=true;
 const limited = recovery.waitForResponse(response=>response.url().includes("/orders/track/")&&response.status()===429);
 await recovery.clock.runFor(10_001);await limited;await recovery.getByRole("alert").filter({hasText:/server cooldown/}).waitFor();
 const count = trackingCalls();await tracker.getByRole("button",{name:"Retry",exact:true}).click();
 await recovery.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:true});document.dispatchEvent(new Event("visibilitychange"));});
 await recovery.clock.runFor(10_000);
 await recovery.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,value:false});document.dispatchEvent(new Event("visibilitychange"));});
 await recoveryContext.setOffline(true);await recoveryContext.setOffline(false);await recovery.clock.runFor(19_000);assert.equal(trackingCalls(),count,"Manual, visible and online events cannot bypass Retry-After");
 throttle=false;const resumed=recovery.waitForResponse(response=>response.url().includes("/orders/track/")&&response.status()===200);await recovery.clock.runFor(1_001);await resumed;await recovery.getByText("Last synchronized",{exact:false}).waitFor();
 trackStatus="delivered";await recovery.clock.runFor(10_001);await recovery.getByText("Final order status · automatic updates stopped",{exact:false}).waitFor();const finished=trackingCalls();await recovery.clock.runFor(60*60_000);assert.equal(trackingCalls(),finished);await recoveryContext.close();
 console.log("PASS browser tracking: Retry-After, retained data, manual/visibility/offline recovery and terminal stop");
 console.log(`Customer feature screenshots: ${output}`);
}catch(error){for(const context of browser?.contexts()||[])for(const page of context.pages()){await page.screenshot({path:path.join(output,"failure.png"),fullPage:true});console.error("Browser failure:",page.url(),(await page.locator("body").innerText()).slice(0,6000));}console.error(`Artifacts: ${output}`);throw error;
}finally{await browser?.close();server.kill();await new Promise(resolve=>server.exitCode!=null?resolve():server.once("exit",resolve));await new Promise(resolve=>fixture.close(resolve));}
