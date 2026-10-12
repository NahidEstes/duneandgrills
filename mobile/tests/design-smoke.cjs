// Diagnostic browser render of native components. Catalog/settings come from a
// read-only staging snapshot; every API write is intercepted locally.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const crypto = require('node:crypto');
const artifacts = path.resolve(__dirname, '../artifacts'); const root = path.resolve(__dirname, process.env.MOBILE_EXPORT_DIR || '../dist');
const snapshot = JSON.parse(fs.readFileSync(path.join(artifacts, 'catalog-snapshot.json'), 'utf8'));
const dish = snapshot.menu.find(p => p.isAvailable && !p.customization?.enabled);
assert.ok(dish, 'Snapshot needs an available item for quick-add verification');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); const errors = []; const mutations = []; let couponFail = false; let dense = false;
  page.on('pageerror', e => errors.push(e.message));
  for (const product of [...snapshot.menu, ...snapshot.combos]) {
    if (!product.image) continue;
    const url = new URL(product.image, 'https://duneandgrills-testing-six.vercel.app/').href;
    const file = path.join(artifacts, crypto.createHash('sha256').update(url).digest('hex') + '.image');
    if (fs.existsSync(file)) await context.route(url, route => route.fulfill({ contentType: 'image/jpeg', body: fs.readFileSync(file) }));
  }
  await context.route('**/api/**', async route => {
    const req = route.request(); const key = new URL(req.url()).pathname.replace(/^\/api\//, '');
    if (req.method() !== 'GET') mutations.push(key);
    if (key === 'offers/validate-coupon') {
      if (couponFail) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Coupon expired' }) });
      const body = req.postDataJSON(); const sub = body.items.reduce((total, line) => total + dish.price * line.quantity, 0);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { originalSubtotal: sub, discountAmount: sub * 0.1 } }) });
    }
    let data = key === 'offers' ? [] : snapshot[key];
    if (dense && key === 'menu') data = Array.from({length: 15}, (_, i) => ({ ...dish, _id: `layout-${i}`, name: `${dish.name} ${i} with a long descriptive catalog name`, category: i % 2 ? 'Other fixture category' : dish.category }));
    if (key === `menu/${dish._id}`) data = dish;
    if (data === undefined) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Local diagnostic does not provide this data' }) });
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  const fits = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${label} fits viewport`);
  const shot = async name => {
    await page.waitForFunction(url => [...document.images].some(img => img.src === url && img.complete && img.naturalWidth > 0), new URL(dish.image, 'https://duneandgrills-testing-six.vercel.app/').href);
    await page.waitForTimeout(250); // Let the tab transition and image layout settle.
    await fits(name); await page.screenshot({path:path.join(artifacts, `${name}.png`), fullPage:true, animations:'disabled'});
  };
  try {
    await page.goto(base); await page.getByText('What are you craving?', {exact:true}).filter({visible:true}).waitFor(); await page.getByRole('button', {name:`View ${dish.name}`,exact:true}).waitFor();
    // Wait for real catalog photography, or explicitly report a failed remote asset.
    await page.waitForFunction(() => [...document.images].some(img => img.src.includes('pexels') && img.complete && img.naturalWidth > 0), null, {timeout:20000}).catch(() => console.log('Remote catalog image did not load; branded fallback inspected instead.'));
    await shot('redesign-home-390');
    await page.getByRole('button', {name:`Add ${dish.name}`,exact:true}).scrollIntoViewIfNeeded(); await shot('redesign-home-picks-390');
    await page.getByRole('textbox', {name:'Search your favourites'}).fill(dish.name); await page.getByRole('button', {name:'Search menu',exact:true}).click();
    await page.getByText('Our menu', {exact:true}).filter({visible:true}).waitFor(); assert.equal(await page.getByRole('textbox', {name:'Search the menu'}).inputValue(),dish.name);
    await page.getByRole('button', {name:`Add ${dish.name}`,exact:true}).click(); await page.getByRole('button', {name:/View cart, 1 items/}).waitFor(); await shot('redesign-menu-390');
    await page.getByRole('button', {name:/View cart, 1 items/}).click(); await page.getByText('Your cart', {exact:true}).filter({visible:true}).waitFor();
    await page.getByRole('button', {name:/Choose delivery address/}).click(); await page.getByRole('textbox', {name:'Delivery address',exact:true}).fill('Owned layout fixture address'); await page.getByRole('textbox', {name:'Phone',exact:true}).fill('+966500000000');
    await page.getByRole('button', {name:'Use this address',exact:true}).click(); await page.getByRole('button', {name:'Choose delivery address, Owned layout fixture address',exact:true}).waitFor();
    await page.getByRole('textbox', {name:'Coupon code',exact:true}).fill('SAVE'); await page.getByRole('button', {name:'Apply',exact:true}).click(); await page.getByText('Coupon applied. Confirmed again at checkout.', {exact:true}).filter({visible:true}).waitFor();
    await page.getByRole('button', {name:'Increase quantity',exact:true}).click(); assert.equal(await page.getByText('Coupon applied. Confirmed again at checkout.', {exact:true}).filter({visible:true}).count(),0,'Cart change invalidates quote');
    couponFail = true; await page.getByRole('button', {name:'Apply',exact:true}).click(); await page.getByText('This coupon cannot be applied. Check the code and order requirements.', {exact:true}).filter({visible:true}).waitFor();
    couponFail = false; await page.getByRole('button', {name:'Apply',exact:true}).click(); await page.getByText('Coupon applied. Confirmed again at checkout.', {exact:true}).filter({visible:true}).waitFor();
    await page.getByRole('button', {name:'Pickup',exact:true}).click(); await page.getByText('Cash on pickup', {exact:true}).filter({visible:true}).waitFor(); assert.equal(await page.getByText('Delivery address',{exact:true}).filter({visible:true}).count(),0);
    await page.getByRole('button', {name:'Delivery',exact:true}).click(); await page.getByText('Cash on delivery', {exact:true}).filter({visible:true}).waitFor();
    await page.getByText('Your cart', {exact:true}).filter({visible:true}).scrollIntoViewIfNeeded(); await shot('redesign-cart-390');
    await page.getByRole('button', {name:'Continue to checkout',exact:true}).scrollIntoViewIfNeeded(); await shot('redesign-cart-summary-390');
    await page.getByRole('button', {name:'Continue to checkout',exact:true}).click(); await page.getByRole('textbox', {name:'Customer name'}).waitFor();
    assert.equal(await page.getByRole('textbox', {name:'Delivery address',exact:true}).inputValue(),'Owned layout fixture address'); assert.equal(await page.getByRole('textbox', {name:'Phone',exact:true}).inputValue(),'+966500000000');
    await page.goto(base + '/orders'); await page.getByText('Your orders',{exact:true}).filter({visible:true}).waitFor(); await page.getByText('No orders yet. Your next meal starts in the menu.',{exact:true}).filter({visible:true}).waitFor();
    await page.goto(base + '/profile'); await page.getByRole('button',{name:'Create customer account',exact:true}).waitFor();
    await page.goto(base + '/order/missing?guest=1'); await page.getByText('Private tracking is not saved for this account on this device',{exact:true}).filter({visible:true}).waitFor();
    for (const width of [320,768]) {
      await page.setViewportSize({width,height:844}); await page.goto(base + '/home'); await page.getByText('What are you craving?',{exact:true}).filter({visible:true}).waitFor(); await page.getByRole('button',{name:`Browse ${dish.category}`,exact:true}).waitFor(); await shot(`redesign-home-${width}`);
      await page.getByRole('button',{name:`Browse ${dish.category}`,exact:true}).click(); await page.getByText('Our menu',{exact:true}).filter({visible:true}).waitFor(); assert.equal(await page.getByRole('button',{name:dish.category,exact:true}).evaluate(el => getComputedStyle(el).backgroundColor),'rgb(255, 122, 24)'); await shot(`redesign-menu-${width}`);
      await page.getByRole('button',{name:/View cart, 2 items/}).click(); await page.getByText('Your cart',{exact:true}).filter({visible:true}).waitFor(); await shot(`redesign-cart-${width}`);
      await page.getByRole('button',{name:'Continue to checkout',exact:true}).scrollIntoViewIfNeeded(); await shot(`redesign-cart-summary-${width}`);
    }
    // Layout stress fixture: lengthy catalog content, enough rows to exercise
    // virtualization, and 130% web text sizing (not native Dynamic Type evidence).
    dense = true; await page.setViewportSize({width:320,height:844}); await page.goto(base + '/home'); await page.getByRole('button',{name:'Explore menu',exact:true}).click(); await page.getByText('Our menu',{exact:true}).filter({visible:true}).waitFor();
    await page.getByRole('button', {name:`Details for ${dish.name} 0 with a long descriptive catalog name`,exact:true}).waitFor();
    await page.mouse.move(160, 420);
    for (let step = 0; step < 10; step++) {
      await page.mouse.wheel(0, 1600);
      if (await page.getByRole('button',{name:/Details for .*14 with/}).count()) break;
      await page.waitForTimeout(150);
    }
    await page.getByRole('button',{name:/Details for .*14 with/}).scrollIntoViewIfNeeded();
    const lastAdd = page.getByRole('button',{name:/Add .*14 with/});
    await lastAdd.scrollIntoViewIfNeeded();
    const last = await lastAdd.boundingBox(); const bar = await page.getByRole('button',{name:/View cart, 2 items/}).boundingBox(); assert.ok(last.y + last.height <= bar.y,'Last item add control remains above cart footer');
    await page.evaluate(() => {
      const text = [...document.querySelectorAll('div[dir="auto"], input, textarea')].map(node => {
        const style = getComputedStyle(node); const size = parseFloat(style.fontSize);
        return { node, size: size * 1.3, line: (parseFloat(style.lineHeight) || size * 1.2) * 1.3 };
      });
      for (const { node, size, line } of text) { node.style.fontSize = `${size}px`; node.style.lineHeight = `${line}px`; }
    });
    await lastAdd.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
    const enlarged = await lastAdd.boundingBox(); const enlargedBar = await page.getByRole('button',{name:/View cart, 2 items/}).boundingBox(); assert.ok(enlarged.y + enlarged.height <= enlargedBar.y,'Enlarged last item add control remains above cart footer');
    await fits('130% text'); await shot('redesign-menu-large-text-320');
    await page.goto(base + '/cart'); await page.getByRole('button',{name:`Remove ${dish.name}`,exact:true}).click(); await page.getByText('Your cart is empty.',{exact:true}).filter({visible:true}).waitFor();
    await page.getByRole('button',{name:'Explore the menu',exact:true}).click(); assert.equal(await page.getByRole('button',{name:/View cart, /}).count(),0);
    assert.deepEqual(errors, []); assert.ok(mutations.every(key => key === 'offers/validate-coupon')); console.log('PASS: Home search/categories, quick add, Menu cart footer, quantity/quote invalidation, coupon failure/retry, fulfillment, guest address selection/draft, guest Orders/Profile/private-tracking guard, remove/empty cart, 320/390/768 layouts, long virtualized list/footer and enlarged web text. All API mutations were intercepted.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1;});
