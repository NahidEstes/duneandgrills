import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
// Own both servers and all dummy responses. No dotenv, MongoDB or application backend.
const root = path.resolve(import.meta.dirname, "..");
const product = { _id:"222222222222222222222222",name:"Local fixture burger with a long test-only name",description:"A long description used only for isolated layout checks. ".repeat(6),image:"/logo.jpeg",price:20,category:"Food",isAvailable:true,customization:{enabled:true,spice:{enabled:true,options:["medium","hot"],default:"medium"}},addOns:[{_id:"333333333333333333333333",name:"Local extra with a long test-only name",price:3,image:"/logo.jpeg"}] };
const settings={timezone:"Asia/Riyadh",location:{address:"Isolated test address",city:"Riyadh",country:"Saudi Arabia",phone:"+0000000000",directionsUrl:"https://example.invalid/directions"},openingHours:["saturday","sunday","monday","tuesday","wednesday","thursday","friday"].map(day=>({day,isOpen:true,periods:[{open:day==="friday"?"13:00":"11:00",close:"23:00"}]})),orders:{channels:{website:true}},receipt:{}};
let menuFailure=false,emptyMenu=false,ordering=true,holdOrder=false,releaseOrder,loseResponse=false,orders=new Map(),calls=[];
const fixture=createServer(async(req,res)=>{
  const url=new URL(req.url,"http://127.0.0.1"),resource=url.pathname.replace(/^\/api/,"");
  let body; if(!["GET","HEAD"].includes(req.method)){let raw="";for await(const chunk of req)raw+=chunk;body=raw?JSON.parse(raw):{};}
  calls.push({method:req.method,resource,body});
  let status=200,data={success:true,data:[]};
  if(resource==="/auth/me" || resource==="/auth/session"){status=401;data={success:false,message:"Isolated guest"};}
  else if(resource==="/menu") {if(menuFailure){status=503;data={success:false,message:"Owned menu failure"};}else data.data=emptyMenu?[]:[product];}
  else if(resource==="/categories")data.data=[{name:"Food",type:"menu",isActive:true}];
  else if(resource==="/settings/public")data.data=settings;
  else if(resource==="/orders/config")data.data={websiteOrderingEnabled:ordering,defaultOrderType:"pickup",minimumDeliveryOrder:0,orderTypes:[{value:"pickup",label:"Pickup",deliveryFee:0}]};
  else if(resource==="/offers/validate-coupon")data.data={code:"LOCAL5",title:"Isolated coupon",discountAmount:5};
  else if(resource==="/orders" && req.method==="POST"){
    if(!orders.has(body.idempotencyKey))orders.set(body.idempotencyKey,{_id:"444444444444444444444444",orderNumber:"TEST-PUBLIC-ORDER",status:"pending",paymentStatus:"pending",totalAmount:41,items:[{name:product.name,quantity:2}],customerName:"Local guest"});
    if(holdOrder)await new Promise(resolve=>{releaseOrder=resolve;});
    if(loseResponse){loseResponse=false;status=503;data={success:false,message:"Owned uncertain response"};}
    else data={success:true,data:orders.get(body.idempotencyKey),trackingToken:"isolated-private-code"};
  } else if(resource.startsWith("/orders/track/")){
    if(req.headers["x-order-tracking-token"]!=="isolated-private-code"){status=404;data={success:false,message:"Private code required"};}else data.data=[...orders.values()][0];
  }else if(resource==="/auth/login"){status=401;data={success:false,message:"Isolated invalid login"};}
  res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"private,no-store"});res.end(JSON.stringify(data));
});
await new Promise(resolve=>fixture.listen(0,"127.0.0.1",resolve));
const probe=createServer();await new Promise(resolve=>probe.listen(0,"127.0.0.1",resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const origin=`http://127.0.0.1:${port}`,env={...process.env,NODE_ENV:"production",BACKEND_API_URL:`http://127.0.0.1:${fixture.address().port}/api`,SITE_URL:origin,SITE_ENV:"staging"};
for(const key of Object.keys(env))if(/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|TOKEN/i.test(key))delete env[key];
const next=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(port)],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});
let log="",browser;next.stdout.on("data",chunk=>{log+=chunk;});next.stderr.on("data",chunk=>{log+=chunk;});
try{
  for(let i=0;i<100;i++){try{if((await fetch(origin+"/login")).ok)break;}catch{}if(next.exitCode!=null)throw new Error(log);await new Promise(resolve=>setTimeout(resolve,200));}
  const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE,"index.mjs")).href:"playwright");
  browser=await chromium.launch({channel:"chrome",headless:true});
  const screenshots=await mkdtemp(path.join(tmpdir(),"dg-public-usability-")),image=await readFile(path.join(root,"public/logo.jpeg"));
  const inspect=async(page,label)=>{
    await page.waitForFunction(()=>document.title.trim().length>0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,label+" has no page overflow");
    const violations=await page.evaluate(async()=>(await window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}})).violations.map(row=>({id:row.id,nodes:row.nodes.map(node=>node.target)})));
    assert.deepEqual(violations,[],label+" measured accessibility checks");
  };
  for(const width of [320,390,768,1440]){
    menuFailure=false;emptyMenu=false;ordering=true;orders=new Map();holdOrder=false;loseResponse=false;calls=[];
    const context=await browser.newContext({viewport:{width,height:width<500?740:1000},serviceWorkers:"block",reducedMotion:"reduce"});
    await context.addInitScript({path:path.join(root,"node_modules/axe-core/axe.min.js")});
    await context.route("https://images.unsplash.com/**",route=>route.fulfill({contentType:"image/jpeg",body:image}));
    await context.route("https://www.google.com/**",route=>route.fulfill({contentType:"text/html",body:"<html lang='en'><title>Isolated map placeholder</title><body>Test map</body></html>"}));
    const page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));page.on("dialog",dialog=>dialog.accept());
    try{
      await page.goto(origin);await page.getByRole("button",{name:"Customize & Add",exact:true}).waitFor();
      if(width<1024){const toggle=page.getByRole("button",{name:"Toggle navigation menu"});await toggle.click();assert.equal(await toggle.getAttribute("aria-expanded"),"true");await page.keyboard.press("Escape");assert.equal(await toggle.evaluate(node=>node===document.activeElement),true);await toggle.click();await page.locator("#public-mobile-navigation").getByRole("link",{name:"Menu",exact:true}).click();}
      else await page.locator("header").getByRole("link",{name:"Menu",exact:true}).click();
      await page.waitForURL(origin+"/menu");await page.getByText("1 matching item",{exact:true}).waitFor();
      await page.locator("#public-app-options").getByRole("button",{name:"App options",exact:true}).waitFor({state:"attached"});
      const menuReads=()=>calls.filter(row=>row.resource==="/menu").length,before=menuReads();
      await page.getByRole("searchbox",{name:"Search menu"}).fill("not-found");await page.getByText("0 matching items",{exact:true}).waitFor();assert.equal(menuReads(),before);
      await page.getByRole("button",{name:"Reset menu filters",exact:true}).click();await page.getByText("1 matching item",{exact:true}).waitFor();
      await inspect(page,`menu ${width}`);await page.screenshot({path:path.join(screenshots,`menu-${width}.png`),fullPage:true});
      const trigger=page.getByRole("button",{name:"Customize & Add",exact:true});await trigger.click();
      const item=page.getByRole("dialog",{name:product.name,exact:true});await item.waitFor();
      assert.equal(await page.evaluate(()=>document.body.style.overflow),"hidden");
      for(let n=0;n<12;n++){await page.keyboard.press("Tab");assert.equal(await item.evaluate(node=>node.contains(document.activeElement)),true);}
      await inspect(page,`item ${width}`);await page.screenshot({path:path.join(screenshots,`item-${width}.png`),fullPage:false});
      if(width===320){
        for(let n=0;n<98;n++)await item.getByRole("button",{name:"Increase quantity",exact:true}).click();
        assert.match(await item.getByRole("button",{name:/Add to Cart/}).innerText(),/1980.00 SAR/);
        await inspect(page,"large quantity 320");await page.screenshot({path:path.join(screenshots,"quantity-99-320.png")});
        for(let n=0;n<98;n++)await item.getByRole("button",{name:"Decrease quantity",exact:true}).click();
      }
      await page.keyboard.press("Escape");assert.equal(await trigger.evaluate(node=>node===document.activeElement),true);
      await trigger.click();await item.getByRole("button",{name:"Increase quantity",exact:true}).click();await item.getByRole("button",{name:"Hot",exact:true}).click();
      await item.getByLabel("Add a Note",{exact:false}).fill("Local preparation note "+"longword".repeat(12));await item.getByRole("button",{name:/Add to Cart/}).click();
      await page.locator("[data-sonner-toast]").first().waitFor();
      assert.equal(await page.locator("[data-sonner-toaster]").evaluate(node=>node.getBoundingClientRect().top>=document.querySelector("header").getBoundingClientRect().bottom),true,"Toast stack clears the header");
      await page.screenshot({path:path.join(screenshots,`toast-${width}.png`),fullPage:false});
      await page.getByRole("button",{name:"Open cart, 2 items"}).click();const cart=page.getByRole("dialog",{name:"Your Cart",exact:true});await cart.waitFor();
      await cart.getByRole("button",{name:"Edit options",exact:true}).click();const edit=page.getByRole("dialog",{name:`Edit ${product.name}`,exact:true});await edit.waitFor();
      await edit.getByRole("button",{name:/Local extra/}).click();await edit.getByRole("button",{name:/Save Changes/}).click();
      assert.match(await cart.innerText(),/Line total: 46.00 SAR/);assert.match(await cart.innerText(),/Spice: hot/i);
      assert.equal(await page.evaluate(()=>document.body.style.overflow),"hidden");
      await cart.getByRole("button",{name:"Close cart",exact:true}).click();await page.reload();
      await page.getByRole("button",{name:"Open cart, 2 items"}).click();await cart.waitFor();assert.match(await cart.innerText(),/Line total: 46.00 SAR/);assert.match(await cart.innerText(),/Spice: hot/i);
      await cart.getByRole("button",{name:"Proceed to Checkout",exact:true}).click();
      const checkout=page.getByRole("dialog",{name:"Checkout",exact:true});await checkout.getByRole("button",{name:"sign in",exact:true}).click();
      const login=page.getByRole("dialog",{name:"Login Required",exact:true});await login.waitFor();await inspect(page,`nested login ${width}`);
      await page.keyboard.press("Escape");assert.equal(await checkout.getByRole("button",{name:"sign in",exact:true}).evaluate(node=>node===document.activeElement),true);assert.equal(await page.evaluate(()=>document.body.style.overflow),"hidden");
      await checkout.getByLabel("Customer name").fill("Local guest");await checkout.getByLabel("Customer phone").fill("0000000000");
      await checkout.getByRole("textbox",{name:"Coupon code",exact:true}).fill("LOCAL5");await checkout.getByRole("button",{name:"Apply",exact:true}).click();await checkout.getByText("Coupon applied",{exact:false}).waitFor();
      await checkout.getByRole("button",{name:"Back to cart",exact:true}).click();assert.match(await cart.innerText(),/Discount \(LOCAL5\)/);assert.match(await cart.innerText(),/41.00 SAR/);
      await cart.getByRole("button",{name:"Proceed to Checkout",exact:true}).click();await inspect(page,`checkout ${width}`);await page.screenshot({path:path.join(screenshots,`checkout-${width}.png`),fullPage:false});
      if(width<500){
        await page.setViewportSize({width,height:460});await checkout.getByLabel("Kitchen notes").focus();
        await checkout.getByRole("button",{name:"Place Order",exact:true}).scrollIntoViewIfNeeded();
        assert.equal(await checkout.getByRole("button",{name:"Place Order",exact:true}).evaluate(node=>{const box=node.getBoundingClientRect();return box.top>=0&&box.bottom<=innerHeight;}),true,"Checkout action remains reachable in a keyboard-sized viewport");
        await inspect(page,`short checkout ${width}`);await page.screenshot({path:path.join(screenshots,`short-checkout-${width}.png`)});await page.setViewportSize({width,height:740});
      }
      holdOrder=true;loseResponse=true;await checkout.getByRole("button",{name:"Place Order",exact:true}).click();await checkout.getByRole("button",{name:"Placing Order...",exact:true}).waitFor();
      await checkout.getByRole("button",{name:"Close cart",exact:true}).click();assert.equal(await page.locator("dialog[open]").count(),0);assert.equal(await page.evaluate(()=>document.body.style.overflow),"");
      assert.equal(await page.getByRole("button",{name:"Place Order",exact:true}).count(),0,"Closed cart is excluded from accessible keyboard controls");
      await page.getByRole("button",{name:"Open cart, 2 items"}).click();holdOrder=false;releaseOrder();
      await checkout.getByRole("button",{name:"Check original order",exact:true}).waitFor();await checkout.getByRole("button",{name:"Check original order",exact:true}).click();
      await page.getByRole("dialog",{name:"Order Placed",exact:true}).getByRole("button",{name:"Track this order",exact:true}).waitFor();assert.equal(orders.size,1);
      const posts=calls.filter(row=>row.resource==="/orders"&&row.method==="POST");assert.equal(posts.length,2);assert.equal(posts[0].body.idempotencyKey,posts[1].body.idempotencyKey);assert.deepEqual(posts[0].body,posts[1].body);
      await page.getByRole("button",{name:"Track this order",exact:true}).click();await page.getByText("Last synchronized",{exact:false}).waitFor();assert.ok(!page.url().includes("isolated-private-code"));await inspect(page,`tracking ${width}`);
      await page.getByRole("navigation",{name:"Footer navigation"}).getByRole("link",{name:"Contact",exact:true}).click();await page.waitForURL(origin+"/#visit");await page.locator("#visit").waitFor();
      assert.equal(await page.locator("#visit").evaluate(node=>node.getBoundingClientRect().top>=63),true,"Contact heading clears fixed navigation");await inspect(page,`contact ${width}`);
      ordering=false;await page.reload();await page.getByRole("link",{name:"View Menu",exact:true}).waitFor();assert.equal(await page.getByRole("link",{name:"Order Now",exact:true}).count(),0);
      await page.goto(origin+"/menu");await page.getByRole("status").filter({hasText:"Online ordering is currently unavailable"}).waitFor();await page.getByRole("button",{name:"Open cart, 2 items"}).click();await cart.waitFor();assert.equal(await cart.getByRole("button",{name:"Proceed to Checkout",exact:true}).isDisabled(),true);await page.keyboard.press("Escape");
      menuFailure=true;await page.goto(origin);await page.getByRole("button",{name:"Retry menu",exact:true}).waitFor();menuFailure=false;emptyMenu=true;await page.getByRole("button",{name:"Retry menu",exact:true}).click();await page.getByText("Our menu has no available items right now.",{exact:false}).waitFor();
      await page.goto(origin+"/login");await page.getByLabel("Email",{exact:true}).waitFor();await page.getByRole("button",{name:"Sign up",exact:true}).click();await page.getByLabel("Full name",{exact:true}).waitFor();assert.equal(await page.getByLabel("Phone (optional)").getAttribute("type"),"tel");await page.locator("#public-app-options").getByRole("button",{name:"App options",exact:true}).waitFor({state:"attached"});await inspect(page,`registration ${width}`);await page.screenshot({path:path.join(screenshots,`register-${width}.png`),fullPage:true});
      assert.deepEqual(errors,[]);console.log(`PASS public ${width}px: contact/menu, local filters, named/nested dialogs, keyboard/scroll, edit/discount, pending close/recovery (one order), tracking, disabled ordering, empty/retry, labels and measured axe checks`);
    }catch(error){console.log((await page.locator("body").innerText()).slice(-2000));await page.screenshot({path:path.join(screenshots,`failure-${width}.png`),fullPage:true});console.log(`Failure screenshots: ${screenshots}`);throw error;}finally{await context.close();}
  }
  console.log(`Screenshots: ${screenshots}`);
}finally{await browser?.close();if(next.exitCode==null){const stopped=new Promise(resolve=>next.once("exit",resolve));next.kill();await stopped;}await new Promise(resolve=>fixture.close(resolve));}
