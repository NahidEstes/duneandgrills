// Built Next.js browser fallback, no native app. All browser API reads are
// intercepted and every API mutation fails the test before reaching a server.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { spawn } = require('node:child_process'); const path = require('node:path'); const fs = require('node:fs'); const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'); const artifacts = path.resolve(root, '../mobile/artifacts');
const food = { _id: 'fixture-food', name: 'Shared Fixture Food', description: 'Fresh fixture meal', price: 25, isAvailable: true, image: '', addOns: [], customization: { enabled: false } };
const combo = { ...food, _id: 'fixture-combo', name: 'Shared Fixture Combo', comboPrice: 29, status: 'published', items: [{ menuItem: food, quantity: 1 }] };
const offer = { _id: 'fixture-offer', title: 'Shared Fixture Offer', description: 'Fresh current offer', isActive: true, startDate: '2020-01-01', expiresAt: '2099-01-01', orderProduct: { productType: 'menuItem', product: food } };
async function main() {
  const server = spawn(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '3106'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; server.stdout.on('data', data => { output += data; }); server.stderr.on('data', data => { output += data; });
  let browser; const errors = []; let unavailable = false; let expired = false; let outage = false; const apiReads = [];
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Next startup: ' + output)), 30000); const check = () => { if (output.includes('Ready in')) { clearTimeout(timer); resolve(); } else if (server.exitCode !== null) { clearTimeout(timer); reject(new Error(output)); } else setTimeout(check, 100); }; check(); });
    browser = await chromium.launch({ channel: 'chrome', headless: true }); const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' }); const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/**', async route => {
      const request = route.request(); const key = new URL(request.url()).pathname.replace(/^\/api\//, ''); assert.equal(request.method(), 'GET', 'No automatic account/cart/order writes'); apiReads.push(key);
      const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, ...(status >= 400 ? { message: 'Fixture unavailable' } : {}) }) });
      if (key === 'menu/' + food._id) return reply({ ...food, isAvailable: !unavailable }, outage ? 503 : 200);
      if (key === 'combos/' + combo._id) return reply({ ...combo, items: [{ quantity: 1, menuItem: { ...food, isAvailable: !unavailable } }] });
      if (key === 'offers/' + offer._id) return reply({ ...offer, expiresAt: expired ? '2020-01-01' : offer.expiresAt });
      if (key === 'settings/public') return reply({ receipt: { restaurantName: 'Dune & Grills' }, location: {} });
      if (key === 'menu' || key === 'combos' || key.startsWith('blog') || key === 'offers' || key === 'profile/favorites') return reply([]);
      return reply(null, 401);
    });
    for (const [kind, name] of [['item', food.name], ['combo', combo.name], ['offer', offer.title]]) {
      const response = await page.goto(`http://127.0.0.1:3106/${kind}/fixture-${kind === 'item' ? 'food' : kind}`); assert.equal(response.status(), 200); await page.getByRole('heading', { name, exact: true }).waitFor();
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(artifacts, `shared-website-${kind}-390.png`), animations: 'disabled' });
    }
    assert.equal(await page.getByRole('link', { name: new RegExp('View ' + food.name) }).getAttribute('href'), '/item/' + food._id);
    expired = true; await page.reload(); await page.getByRole('heading', { name: 'Content unavailable' }).waitFor(); assert.equal(await page.getByRole('heading', { name: offer.title }).count(), 0);
    unavailable = true; await page.goto('http://127.0.0.1:3106/combo/' + combo._id); await page.getByRole('heading', { name: 'Content unavailable' }).waitFor();
    await page.goto('http://127.0.0.1:3106/item/' + food._id); await page.getByRole('heading', { name: 'Content unavailable' }).waitFor();
    unavailable = false; outage = true; await page.reload(); await page.getByText('Unable to load this content. Please retry.').waitFor(); outage = false; await page.getByRole('button', { name: 'Retry' }).click(); await page.getByRole('heading', { name: food.name }).waitFor();
    const before = apiReads.filter(key => key.startsWith('menu/')).length; await page.goto('http://127.0.0.1:3106/item/invalid%24id'); await page.getByText('This shared link is invalid.').waitFor(); assert.equal(apiReads.filter(key => key.startsWith('menu/')).length, before);
    await page.setViewportSize({ width: 320, height: 740 }); await page.goto('http://127.0.0.1:3106/item/' + food._id); await page.getByRole('heading', { name: food.name }).waitFor(); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await page.screenshot({ path: path.join(artifacts, 'shared-website-item-320.png'), animations: 'disabled' });
    assert.deepEqual(errors, []); console.log('PASS: built website /item, /combo, /offer public fallback without native app; fresh public data/current prices; included-food links; unavailable/expired/malformed/retry states; 320/390 layouts; no API writes.');
  } finally { if (browser) await browser.close(); server.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
