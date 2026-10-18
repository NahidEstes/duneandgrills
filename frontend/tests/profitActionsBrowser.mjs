import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { composeProfitReport } from "../../backend/services/profitReportingService.js";
import { resolveAnalyticsRange } from "../../backend/services/adminAnalyticsService.js";
import { prioritySort } from "../../backend/services/adminPriorityActionsService.js";

// Owned loopback backend + production Next. No dotenv, live database, real
// restaurant records or external API. Non-GET requests are rejected and counted.
const root=path.resolve(import.meta.dirname,".."), output=await mkdtemp(path.join(tmpdir(),"dg-profit-actions-")), image=await readFile(path.join(root,"public/logo.jpeg"));
const now=new Date("2026-10-18T12:00:00Z"),orderId="111111111111111111111111",stockId="222222222222222222222222",menuId="333333333333333333333333";
let failReport=false,missing=false,failOperations=false,resolved=false,calls=[];
const sale={_id:orderId,orderNumber:"TEST-PROFIT",source:"pos",reportCaptured:true,inventoryStatus:"deducted",items:[{menuItem:menuId,quantity:1}]};
const movement={_id:"debit",order:orderId,item:"ingredient",status:"COMPLETED",movementType:"STOCK_OUT",quantity:2,batchAllocations:[{batch:"original",quantity:2,unitCost:10}],sourceDetails:{components:[{type:"menu_recipe",menuItem:menuId}],lineQuantities:[{index:0,quantity:2}]}};
function report(query){
 const net=missing?140:100,range=resolveAnalyticsRange({period:"month",...query},now);
 return composeProfitReport({sales:{summary:{orderedAmount:net,grossSales:net,discountTotal:10,completedRefunds:0,voidAmount:0,netSales:net,collectedAmount:net,capturedOrders:missing?2:1,totalOrders:missing?2:1},cashActivity:{collectedAmount:net,completedRefunds:0,netCollected:net,unknownPaymentDateAmount:0,unknownRefundDateAmount:0},sourceBreakdown:[{source:"pos",netSales:net}]},orders:missing?[sale,{...sale,_id:"missing",orderNumber:"TEST-MISSING"}]:[sale],movements:[movement],waste:[{...movement,_id:"waste",movementType:"WASTE",quantity:1,batchAllocations:[{batch:"waste",quantity:1,unitCost:5}]}],expenses:[{totalAmount:30,vatAmount:3,amountPaid:30,recordStatus:"active"}],range,query,now});
}
function operations(){
 const items=resolved?[]:[
  {key:"order:pending",recordId:orderId,recordNumber:"TEST-PENDING",priority:1,since:"2026-10-18T11:00:00Z",reasons:["Pending beyond threshold","Preparation past its recorded deadline"],action:{label:"Review order",href:`/admin?tab=orders&order=${orderId}`}},
  {key:"order:ready",recordId:"ready",recordNumber:"TEST-READY",priority:1,since:"2026-10-18T11:30:00Z",reasons:["Food ready; no rider assigned"],action:{label:"Assign rider",href:"/admin/deliveries?workspace=active&search=TEST-READY"}},
  {key:"order:cash",recordId:"cash",recordNumber:"TEST-CASH",priority:0,since:"2026-10-18T11:00:00Z",reasons:["Cash discrepancy acknowledged; receipt/payment still not confirmed"],reportedCashHalala:1200,ledgerOutstandingHalala:2000,action:{label:"Review cash",href:"/admin/deliveries?workspace=cash&search=TEST-CASH"}},
  {key:`stock:${stockId}`,recordId:stockId,recordNumber:"STOCK-OWNED",name:"Owned stock item",priority:0,since:null,reasons:["No saleable stock","Blocked stock: expired"],action:{label:"Open stock item",href:`/inventory/stock-items?edit=${stockId}`}},
 ];
 return {generatedAt:now,pendingAttentionMinutes:5,categories:{},shifts:{status:"success",enabled:false},priorityActions:{total:items.length,knownTotal:items.length,complete:true,limit:12,sources:{},items:items.sort(prioritySort),deliveryEnabled:true}};
}
const fixture=createServer(async(req,res)=>{
 const url=new URL(req.url,"http://127.0.0.1"),resource=url.pathname.replace(/^\/api/,""),query=Object.fromEntries(url.searchParams),role=/dg_session=([^;]+)/.exec(req.headers.cookie||"")?.[1]||"manager";
 calls.push({resource,query,method:req.method,role});let status=200,payload={success:true,data:[]};
 if(!["GET","HEAD"].includes(req.method)){status=400;payload={success:false,message:"Isolated browser mutations are forbidden"};}
 else if(["/auth/me","/auth/session"].includes(resource))payload={success:true,user:{_id:"aaaaaaaaaaaaaaaaaaaaaaaa",name:"Owned report fixture",role}};
 else if(resource==="/expenses/profit-report"){status=failReport?503:200;payload=failReport?{success:false,message:"Owned report temporarily unavailable"}:{success:true,data:report(query)};}
 else if(resource==="/admin/operations-overview"){status=failOperations?503:200;payload=failOperations?{success:false,message:"Owned operations temporarily unavailable"}:{success:true,data:operations()};}
 else if(resource==="/admin/dashboard")payload.data={reportingPeriod:{period:query.period||"today",label:"Owned reporting period"},stats:{totalOrders:1,pendingOrders:0,completedOrders:1,totalRevenue:100,netSales:100},recentOrders:[],recentOrdersMeta:{page:1,limit:8,total:0},menuPreview:[],recentPosts:[],offers:[],recentReviews:[],activities:[]};
 else if(resource==="/settings")payload.data={notifications:{adminSoundEnabled:false,pollingIntervalSeconds:60},riderDelivery:{enabled:true},orders:{}};
 else if(resource==="/settings/public")payload.data={location:{},openingHours:[]};
 else if(resource==="/cart")payload.data={items:[],coupon:null};
 else if(resource==="/orders/config")payload.data={websiteOrderingEnabled:false,orderTypes:[]};
 else if(resource===`/orders/${orderId}`)payload.data={_id:orderId,orderNumber:"TEST-PENDING",source:"website",status:"preparing",paymentStatus:"pending",totalAmount:20,customer:{name:"Owned fixture",phone:"0500000000"},items:[{name:"Owned dish",price:20,quantity:1}],createdAt:now,orderType:"pickup"};
 else if(resource==="/orders")payload={success:true,data:[],pagination:{page:1,pages:1,total:0,limit:20}};
 else if(resource==="/deliveries/config")payload={success:true,mode:"operational",operationalEnabled:true,workflowEnabled:false};
 else if(resource==="/deliveries")payload={success:true,mode:"operational",operationalEnabled:true,deliveries:[],riderFilters:[],counts:{unassigned:0,assigned:0,picked_up:0,issue:0,delivered:0,active:0},pagination:{page:1,limit:20,total:0},health:{thresholds:{pickupMinutes:15,deliveryMinutes:45},activeAttentionCount:0,attention:{},cash:{},deliveredCash:{},confirmedToday:{count:0,amountHalala:0}}};
 else if(resource===`/inventory/items/${stockId}`)payload.data={_id:stockId,name:"Owned stock item",sku:"STOCK-OWNED",unit:"kg",purchaseUnit:"kg",purchaseConversionFactor:1,currentStock:0,reorderLevel:10,unitCost:10,isActive:true};
 else if(resource==="/inventory/items")payload={success:true,data:[],pagination:{page:1,pages:1,total:0,limit:20}};
 res.writeHead(status,{"Content-Type":"application/json","Cache-Control":"private, no-store"});res.end(JSON.stringify(payload));
});
await new Promise(resolve=>fixture.listen(0,"127.0.0.1",resolve));
const probe=createServer();await new Promise(resolve=>probe.listen(0,"127.0.0.1",resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const origin=`http://127.0.0.1:${port}`,env={...process.env,NODE_ENV:"production",SITE_URL:origin,SITE_ENV:"staging",BACKEND_API_URL:`http://127.0.0.1:${fixture.address().port}/api`};
for(const key of Object.keys(env))if(/MONGO|DATABASE|JWT_SECRET|API_PROXY_SECRET|RESEND|CUSTOMER_EMAIL/i.test(key))delete env[key];
const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p",String(port)],{cwd:root,env,windowsHide:true,stdio:["ignore","pipe","pipe"]});let log="",browser;
server.stdout.on("data",text=>log+=text);server.stderr.on("data",text=>log+=text);
try{
 for(let n=0;n<100;n++){try{await fetch(origin+"/login");break;}catch{if(server.exitCode!=null)throw Error(log);await new Promise(resolve=>setTimeout(resolve,200));}}
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(path.join(process.env.PLAYWRIGHT_MODULE,"index.mjs")).href:"playwright");browser=await chromium.launch({channel:"chrome",headless:true});
 for(const viewport of [{width:1440,height:1000},{width:390,height:844},{width:320,height:760}]){
  failReport=false;missing=false;failOperations=false;resolved=false;calls=[];
  const context=await browser.newContext({viewport,acceptDownloads:true,serviceWorkers:"block"}),page=await context.newPage(),errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.clock.setFixedTime(now);
  await context.addCookies([{name:"dg_session",value:"manager",url:origin}]);await context.addInitScript(()=>{window.print=()=>{window.__testPrinted=true;};});
  await context.route("**/_next/image**",route=>route.fulfill({contentType:"image/jpeg",body:image}));await context.route("https://**",route=>route.fulfill({status:200,body:""}));
  const shot=async label=>{await page.screenshot({path:path.join(output,`${label}-${viewport.width}.png`),fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${label}: overflow ${viewport.width}`);};
  await page.goto(origin+"/admin/expenses/profit");await page.getByRole("heading",{name:"Profit & Cost Report",exact:true}).waitFor();await page.getByText("1 recorded-cost orders",{exact:false}).waitFor();await page.getByRole("button",{name:"CSV",exact:true}).waitFor({state:"visible"});await shot("profit");await page.getByRole("heading",{name:"Recognized net sales",exact:true}).scrollIntoViewIfNeeded();await shot("profit-summary");await page.evaluate(()=>scrollTo(0,0));
  const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"CSV",exact:true}).click();const download=await downloadPromise;await download.saveAs(path.join(output,`profit-${viewport.width}.csv`));const csv=await readFile(await download.path(),"utf8");assert.match(csv,/"Recorded-basis operating profit \(indicative\)","45"/);assert.match(csv,/"Net profit \(not asserted\)","Unavailable"/);
  const popupPromise=page.waitForEvent("popup");await page.getByRole("button",{name:"PDF / Print",exact:true}).click();const popup=await popupPromise;await popup.getByRole("heading",{name:/Profit & Cost Report/}).waitFor();assert.match(await popup.locator("body").innerText(),/SAR 45\.00/);if(viewport.width===1440)await popup.pdf({path:path.join(output,"profit-fixture.pdf"),format:"A4",landscape:true,printBackground:true});await popup.close();
  await page.getByRole("button",{name:"Today",exact:true}).click();await page.waitForResponse(response=>response.url().includes("profit-report?period=today")&&response.ok());
  await page.getByRole("button",{name:"Last 7 Days",exact:true}).click();await page.waitForResponse(response=>response.url().includes("profit-report?period=week")&&response.ok());
  await page.getByRole("combobox",{name:"Sales channel"}).click();await page.getByRole("option",{name:"POS",exact:true}).click();await page.waitForResponse(response=>response.url().includes("source=pos")&&response.ok());await page.getByText("Channel operating profit is unavailable.",{exact:false}).waitFor();
  await page.getByRole("button",{name:"Custom Date",exact:true}).click();
  for(const label of ["From date","To date"]){await page.getByRole("button",{name:label,exact:true}).click();const dialog=page.getByRole("dialog",{name:"Choose date",exact:true});await dialog.getByPlaceholder("DD-MM-YYYY",{exact:true}).fill("18-10-2026");await dialog.getByRole("button",{name:"Go",exact:true}).click();await page.keyboard.press("Escape");}
  await page.getByRole("button",{name:"Apply dates",exact:true}).click();await page.waitForResponse(response=>response.url().includes("period=custom")&&response.ok());assert.equal(calls.filter(call=>call.resource==="/expenses/profit-report").at(-1).query.from,"2026-10-18");
  missing=true;await page.getByRole("button",{name:"Refresh report",exact:true}).click();await page.getByText("1 missing/incomplete",{exact:false}).waitFor();await shot("profit-missing");
  failReport=true;await page.getByRole("button",{name:"Refresh report",exact:true}).click();await page.getByRole("alert").filter({hasText:/Retained report may be outdated/}).waitFor();assert.equal(await page.getByRole("button",{name:"CSV",exact:true}).isDisabled(),true);await shot("profit-stale");failReport=false;
  await page.goto(origin+"/admin");await page.getByRole("heading",{name:/Priority actions/}).waitFor();await page.getByText("Showing 4 of 4",{exact:false}).waitFor();await page.getByRole("heading",{name:/Priority actions/}).scrollIntoViewIfNeeded();await shot("priority");
  const orderLink=page.getByRole("link",{name:"Review order",exact:true});assert.equal(new URL(await orderLink.getAttribute("href"),origin).searchParams.get("order"),orderId);
  const orderResponse=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/orders/${orderId}`);await orderLink.click();await orderResponse;assert.equal(new URL(page.url()).searchParams.get("order"),orderId);await page.goto(origin+"/admin");await page.getByRole("link",{name:"Review cash",exact:true}).click();await page.waitForResponse(response=>new URL(response.url()).pathname==="/api/deliveries");const cashCall=calls.filter(call=>call.resource==="/deliveries").at(-1);assert.equal(cashCall.query.workspace,"cash");assert.equal(cashCall.query.search,"TEST-CASH");await shot("linked-cash");
  await page.goto(origin+"/admin");await page.getByRole("link",{name:"Assign rider",exact:true}).click();await page.waitForResponse(response=>new URL(response.url()).pathname==="/api/deliveries");assert.equal(calls.filter(call=>call.resource==="/deliveries").at(-1).query.search,"TEST-READY");
  await page.goto(origin+"/admin");await page.getByRole("link",{name:"Open stock item",exact:true}).click();await page.getByRole("heading",{name:"Edit Owned stock item",exact:true}).waitFor();assert.ok(calls.some(call=>call.resource===`/inventory/items/${stockId}`));await page.keyboard.press("Escape");
  await page.goto(origin+"/admin");await page.getByRole("heading",{name:/Priority actions/}).waitFor();failOperations=true;await page.getByRole("button",{name:"Retry / refresh operations",exact:true}).click();await page.getByRole("alert").filter({hasText:/Operations may be outdated/}).waitFor();await page.getByRole("link",{name:"Review cash",exact:true}).waitFor();failOperations=false;resolved=true;await page.getByRole("button",{name:"Retry / refresh operations",exact:true}).click();await page.getByText("No unresolved priority actions at this update.",{exact:true}).waitFor();assert.equal(await page.getByRole("link",{name:"Review cash",exact:true}).count(),0);await shot("priority-resolved");
  await context.addCookies([{name:"dg_session",value:"accountant",url:origin}]);await page.goto(origin+"/admin/expenses/profit");await page.getByRole("heading",{name:"Profit & Cost Report",exact:true}).waitFor();await page.getByRole("heading",{name:"Orders needing cost evidence",exact:true}).waitFor();assert.equal(await page.getByRole("link",{name:"TEST-MISSING",exact:true}).count(),0);
  await page.addScriptTag({path:path.join(root,"node_modules/axe-core/axe.min.js")});const violations=await page.evaluate(async()=>(await window.axe.run(document.querySelector('section[aria-label="Profit and cost report"]'),{runOnly:{type:"tag",values:["wcag2a","wcag2aa"]}})).violations.map(row=>row.id));assert.deepEqual(violations,[]);
  const before=calls.filter(call=>call.resource==="/expenses/profit-report").length;await context.addCookies([{name:"dg_session",value:"cashier",url:origin}]);await page.goto(origin+"/admin/expenses/profit");await page.waitForURL("**/?access=denied");assert.equal(calls.filter(call=>call.resource==="/expenses/profit-report").length,before);
  assert.deepEqual(errors,[]);assert.equal(calls.filter(call=>!["GET","HEAD"].includes(call.method)).length,0,"Dashboard/report actions must remain read-only");await context.close();console.log(`PASS ${viewport.width}px: report filters/CSV/PDF, missing/stale data, deduplicated priority actions, delivery/stock navigation, resolved refresh, permissions and axe`);
 }
 console.log(`Profit/actions browser artifacts: ${output}`);
}catch(error){for(const context of browser?.contexts()||[])for(const page of context.pages()){await page.screenshot({path:path.join(output,"failure.png"),fullPage:true});console.error(page.url(),(await page.locator("body").innerText()).slice(0,3500));}console.error(`Artifacts: ${output}`);throw error;}
finally{await browser?.close();server.kill();await new Promise(resolve=>server.exitCode!=null?resolve():server.once("exit",resolve));await new Promise(resolve=>fixture.close(resolve));}
