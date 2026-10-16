// Actual application in the protected-storage fixture harness. All API traffic
// is intercepted; these checks never call a staging or production server.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '../artifacts/profile-harness-dist'), artifacts = path.resolve(__dirname, '../artifacts');
const user = { _id: 'checkout-owner', name: 'Checkout Customer', email: 'checkout@example.test', phone: '+966500000000', role: 'customer' };
const dish = { _id: '123456789012345678901234', name: 'Fixture Grill', description: 'Fixture dish', category: 'Grills', price: 20, image: '', isAvailable: true, productType: 'menuItem', translations: { ar: { name: 'مشاوي تجريبية' } } };
const line = { key: 'fixture-line', product: dish, quantity: 1, unitPrice: 20, selection: { selectedAddOns: [], spiceLevel: '', note: '' } };
const scheduledAt = '2026-10-18T12:00:00.000Z';
const config = { websiteOrderingEnabled: true, minimumDeliveryOrder: 0, paymentOptions: [{ code: 'cod', enabled: true }], orderTypes: [{ value: 'delivery', label: 'Delivery', deliveryFee: 10 }, { value: 'pickup', label: 'Pickup', deliveryFee: 0 }], checkout: { points: { enabled: true, pointsPerSAR: 100, minimumPoints: 100, maximumDiscountSAR: 10, stackWithCoupons: true }, delivery: { enabled: true, latitude: 24.7, longitude: 46.7 }, scheduling: { enabled: true } } };
const address = { _id: 'old-address', label: 'Home', fullAddress: 'Old address without coordinates', phone: user.phone, isDefault: true };
const server = http.createServer((req, res) => { let file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://fixture').pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');if(!fs.existsSync(file))file=fs.existsSync(file+'.html')?file+'.html':path.join(root,'index.html');res.setHeader('Content-Type',{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res); });
async function main() {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:320,height:812},permissions:[]});const page=await context.newPage();const errors=[], writes=[];let firstOrder;
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(({user,line})=>{if(!localStorage.getItem('checkout-fixture-seeded')){localStorage.setItem('dg.cart.owner.v1',user._id);localStorage.setItem('dg.cart.v1.'+user._id,JSON.stringify([line]));localStorage.setItem('checkout-fixture-seeded','1');}window.__profileFixture={session:{token:'fixture-token',user,expiresAt:Date.now()+86400000}};navigator.geolocation.getCurrentPosition=(_success,fail)=>fail({code:1,message:'denied'});}, {user,line});
  const reply=(route,data,status=200,message)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({success:status<400,data,message})});
  await context.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),key=url.pathname.replace(/^\/api\//,'');
    if(req.method()!=='GET')writes.push({key,body:req.postDataJSON()});
    if(key==='auth/me')return route.fulfill({contentType:'application/json',body:JSON.stringify({user})});
    if(key==='menu')return reply(route,[dish]);if(key==='combos'||key==='offers'||key==='profile/favorites'||key==='orders/my')return reply(route,[]);
    if(key==='profile/addresses')return reply(route,[address]);
    if(key==='settings/public')return reply(route,{location:{city:'Riyadh'},receipt:{}});
    if(key==='rewards/me')return reply(route,{pointsBalance:1000,pointsDebt:0,pointsPerSAR:10,policy:{earnAfter:'completed_and_paid',pointsExpire:false},history:[]});
    if(key==='orders/config')return reply(route,config);if(key==='orders/slots')return reply(route,{enabled:true,timezone:'Asia/Riyadh',slots:[scheduledAt]});
    if(key==='orders/quote') { const body=req.postDataJSON();if(!body.customer.deliveryDetails?.coordinates)return reply(route,null,409,'Select a delivery pin to check service availability');if(body.customer.deliveryDetails.coordinates.latitude===0)return reply(route,null,409,'This address is outside the delivery area. Choose pickup');return reply(route,{subtotal:20,discount:2,pointsDiscount:5,fee:7,total:20}); }
    if(key==='orders') {const body=req.postDataJSON();if(!firstOrder){firstOrder=body;return route.abort('failed');}assert.deepEqual(body,firstOrder,'retry retains original address, schedule, coupon, points and key');return reply(route,null,409,'Scheduled slot is full');}
    if(key==='orders/requests/cancel')return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,cancelled:true})});
    return reply(route,null,404,'Unsupported fixture');
  });
  const button=name=>page.getByRole('button',{name,exact:true}).filter({visible:true});const text=name=>page.getByText(name,{exact:true}).filter({visible:true});
  const shot=async name=>{assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),name+' fits viewport');await page.screenshot({path:path.join(artifacts,name+'.png'),fullPage:true});};
  try {
    await page.goto(base+'/profile');await button('العربية').click();await text('ملفي الشخصي').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('dg.language.v1')),'ar');
    assert.ok(await page.getByRole('tab',{name:'الرئيسية',exact:true}).count());
    await page.goto(base+'/home'); await page.getByRole('tab', { name: 'القائمة', exact: true }).click(); await text('قائمة الطعام').first().waitFor();
    for (const [route, heading] of [['home','ماذا تشتهي؟'], ['offers','عروض اليوم'], ['cart','سلتك'], ['orders','طلباتك'], ['points','النقاط المتاحة'], ['addresses','العناوين المحفوظة'], ['auth','مرحبًا بعودتك']]) {
      await page.goto(base+'/'+route); await text(heading).first().waitFor(); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), route+' Arabic screen fits');
    }
    await page.goto(base+'/checkout');await text('اقترب طلبك من مائدتك').waitFor();
    assert.equal(await page.getByRole('textbox',{name:'اسم العميل',exact:true}).inputValue(),user.name);assert.equal(await page.getByRole('textbox',{name:'عنوان التوصيل',exact:true}).inputValue(),address.fullAddress);
    assert.equal(await page.getByRole('textbox',{name:'الهاتف',exact:true}).evaluate(el=>getComputedStyle(el).direction),'ltr');
    await button('استخدام موقعي').click();await text('لم يُسمح بالوصول إلى الموقع. يمكنك تحديد علامة أو إدخال العنوان يدويًا.').waitFor();
    await button('مراجعة الطلب').click();await text('حدد علامة التوصيل للتحقق من توفر الخدمة.').waitFor();
    await page.getByRole('textbox',{name:'خط العرض',exact:true}).fill('0');await page.getByRole('textbox',{name:'خط الطول',exact:true}).fill('0');await button('مراجعة الطلب').click();await text('هذا العنوان خارج منطقة التوصيل. اختر الاستلام.').waitFor();
    assert.equal(await page.getByRole('textbox',{name:'عنوان التوصيل',exact:true}).inputValue(),address.fullAddress);
    await page.getByRole('textbox',{name:'خط العرض',exact:true}).fill('24.7');await page.getByRole('textbox',{name:'خط الطول',exact:true}).fill('46.7');await page.getByRole('textbox',{name:'المبنى',exact:true}).fill('12');
    await page.getByRole('textbox',{name:'رمز القسيمة (اختياري)',exact:true}).fill('SAVE');await page.getByRole('textbox',{name:'النقاط المستخدمة (٠ لعدم الاستخدام)',exact:true}).fill('500');
    await button('جدولة لوقت لاحق').click();await button(/١٨ أكتوبر ٢٠٢٦/).click();
    await button('مراجعة الطلب').click();const place=page.getByRole('button',{name:/إرسال الطلب النقدي/});await place.waitFor();
    const quote=writes.filter(row=>row.key==='orders/quote').at(-1).body;assert.equal(quote.pointsToRedeem,500);assert.equal(quote.scheduledAt,scheduledAt);assert.equal(quote.customer.deliveryDetails.building,'12');
    await text('اقترب طلبك من مائدتك').scrollIntoViewIfNeeded(); await shot('checkout-ar-form-320');
    await text('ملخص الطلب').scrollIntoViewIfNeeded(); await shot('checkout-ar-combined-320');
    await page.goto(base+'/profile');await button('English').click();await text('My profile').waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('dg.language.v1')),'en');
    // A fresh page boot proves the cart survives switching languages and restart.
    await page.goto(base+'/checkout');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dg.cart.v1.checkout-owner')).length),1);await text('Almost at your table').waitFor();await shot('checkout-en-320');
    await page.getByRole('textbox',{name:'Latitude',exact:true}).fill('24.7');await page.getByRole('textbox',{name:'Longitude',exact:true}).fill('46.7');await page.getByRole('textbox',{name:'Points to redeem (0 for none)',exact:true}).fill('500');await page.getByRole('textbox',{name:'Coupon code (optional)',exact:true}).fill('SAVE');await button('Schedule for later').click();await button(/18 Oct 2026/).click();await button('Review order').click();await button('Place cash order · SAR 20.00').click();await text('Resolve your saved order').waitFor();
    await button('Retry original order').click();await text('Resolve your saved order').waitFor();assert.equal(writes.filter(row=>row.key==='orders').length,2);
    await button('Check or cancel saved order').click();await text('Almost at your table').waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('dg.cart.v1.checkout-owner')).length),1);
    await page.setViewportSize({width:390,height:844});await shot('checkout-recovered-390');assert.deepEqual(errors,[]);
    console.log('PASS: Arabic/English persistence, RTL navigation/input, 320/390px checkout, denied location/web map fallback, legacy address, out-of-area recovery, combined schedule/coupon/points, unknown outcome retry and safe cancel; all API traffic intercepted.');
  } catch (error) { console.log('Visible UI:', await page.locator('body').innerText()); console.log('Page errors:', errors); await page.screenshot({ path: path.join(artifacts, 'checkout-smoke-failure.png'), fullPage: true }); throw error; }
  finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(error=>{console.error(error);server.close();process.exitCode=1;});
