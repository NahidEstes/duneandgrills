// Isolated browser diagnostics: real routes/provider, fixture native storage,
// intercepted APIs only. No fixture switch is shipped in the application.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http'); const crypto = require('node:crypto');
const artifacts = path.resolve(__dirname, '../artifacts'); const root = path.join(artifacts, 'profile-harness-dist');
const snapshot = JSON.parse(fs.readFileSync(path.join(artifacts, 'catalog-snapshot.json'), 'utf8'));
const user = { _id: 'active-customer', name: 'Active Customer', email: 'active@example.test', phone: '+966501234567', role: 'customer' };
const other = { ...user, _id: 'second-customer', name: 'Second Customer', email: 'second@example.test' };
const initial = { _id: 'fixture-pickup', orderNumber: 'DG-FIXTURE-PICKUP-17', totalAmount: 29, subtotal: 29, deliveryFee: 0, discountAmount: 0, status: 'preparing', paymentStatus: 'pending', fulfillmentType: 'pickup', createdAt: '2026-10-11T10:00:00Z', items: [] };
const older = { ...initial, _id: 'fixture-delivery', orderNumber: 'DG-FIXTURE-DELIVERY-16', status: 'pending', fulfillmentType: 'delivery', createdAt: '2026-10-10T10:00:00Z' };
const otherOrder = { ...initial, _id: 'other-order', orderNumber: 'DG-FIXTURE-SECOND-18' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  const errors = []; const reads = []; const writes = []; let current = { ...initial }; let empty = false; let single = false; let outage = false; let revoked = false; let expired = false; let hold = false; let held;
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({ user, initial, older }) => {
    // Each full page load models a fresh isolated device; SPA navigation keeps
    // the actual provider/account transition state for the switch test below.
    localStorage.clear();
    const scenario = new URL(location.href).searchParams.get('fixture'); const fixture = {};
    if (!scenario?.startsWith('guest') && scenario !== 'revoked' && scenario !== 'recovery' && scenario !== 'none') fixture.session = { token: 'isolated-active-token', user, expiresAt: Date.now() + 86400000 };
    if (scenario?.startsWith('guest') || ['revoked', 'expired'].includes(scenario)) fixture.tracking = (scenario === 'guest-multiple' ? [initial, older] : [initial]).map(order => ({ orderNumber: order.orderNumber, token: 'isolated-private-tracking', actor: 'guest', order }));
    if (scenario === 'recovery') fixture.pending = { version: 1, actor: 'guest', token: null, baseUrl: 'https://duneandgrills-testing-six.vercel.app/api', createdAt: new Date().toISOString(), payload: { idempotencyKey: 'isolated-active-pending', fulfillmentType: 'pickup', paymentOption: 'cod', customer: { name: 'Guest fixture', phone: '+966501234567', email: '', address: '' }, items: [], kitchenNotes: '', couponCode: '' } };
    window.__profileFixture = fixture;
  }, { user, initial, older });
  for (const item of snapshot.menu) {
    if (!item.image) continue;
    const url = new URL(item.image, 'https://duneandgrills-testing-six.vercel.app/').href;
    const file = path.join(artifacts, crypto.createHash('sha256').update(url).digest('hex') + '.image');
    if (fs.existsSync(file)) await context.route(url, route => route.fulfill({ contentType: 'image/jpeg', body: fs.readFileSync(file) }));
  }
  await context.route('**/api/**', async route => {
    const req = route.request(); const key = new URL(req.url()).pathname.replace(/^\/api\//, ''); const isOther = req.headers().authorization === 'Bearer isolated-second-token';
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { data } : { message: data }) });
    assert.ok(!req.url().includes('isolated-private-tracking'), 'Tracking credential never enters URLs');
    if (req.method() !== 'GET') {
      writes.push(key); assert.equal(key, 'auth/mobile/login', 'Only simulated sign-in may mutate');
      assert.equal(req.postDataJSON().email, other.email);
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'isolated-second-token', user: other, expiresAt: Date.now() + 86400000 }) });
    }
    reads.push(key);
    if (snapshot[key] !== undefined) return reply(snapshot[key]);
    if (key === 'auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: isOther ? other : user }) });
    if (key === 'orders/my') {
      assert.ok(req.headers().authorization, 'Owner history requires bearer');
      if (expired) return reply('Expired', 401);
      if (outage) return reply('Offline fixture', 503);
      return reply(empty ? [] : isOther ? [otherOrder] : single ? [current] : [older, current, { ...initial, _id: 'done', orderNumber: 'DG-DONE', status: 'delivered' }]);
    }
    if (key.startsWith('orders/track/')) {
      assert.equal(req.headers()['x-order-tracking-token'], 'isolated-private-tracking'); assert.equal(req.headers().authorization, undefined);
      return revoked ? reply('Revoked', 404) : reply(key.endsWith(older.orderNumber) ? older : current);
    }
    if (key.startsWith('orders/')) {
      assert.ok(req.headers().authorization);
      const requested = key.split('/')[1];
      if (hold && requested === initial._id) { hold = false; held = route; return; }
      return reply(requested === otherOrder._id ? otherOrder : requested === older._id ? older : current);
    }
    if (key === 'profile/addresses' || key === 'offers') return reply([]);
    return reply('Unprovided fixture', 503);
  });
  const tab = name => page.getByRole('tab', { name, exact: true });
  const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true });
  const text = name => page.getByText(name, { exact: true }).filter({ visible: true }).locator('xpath=self::*[not(ancestor::*[@aria-hidden="true"])]');
  const shot = async name => {
    await page.waitForTimeout(150); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} fits horizontally`);
    await page.screenshot({ path: path.join(artifacts, `${name}.png`), animations: 'disabled' });
  };
  const home = fixture => page.goto(`${base}/home?fixture=${fixture}`);
  try {
    await home('signed'); await text('Preparing your food').waitFor(); await button('View all active orders (2)').waitFor();
    await text(initial.orderNumber).waitFor(); await text('Collected').waitFor(); assert.equal(await text('Delivered').count(), 0);
    await button('Delivery').click(); await text('Collected').waitFor(); await shot('active-order-home-390');
    await page.setViewportSize({ width: 320, height: 740 }); await shot('active-order-home-320');
    await button('View order ' + initial.orderNumber).click(); await text('Latest restaurant status').waitFor(); assert.ok(page.url().includes('/order/' + initial._id));
    await home('signed'); await text('Preparing your food').waitFor(); await button('View all active orders (2)').click(); await text('Active orders').first().waitFor();
    await text(initial.orderNumber).waitFor(); await text(older.orderNumber).waitFor(); assert.equal(await text('DG-DONE').count(), 0); await shot('active-order-list-320');
    await page.setViewportSize({ width: 390, height: 844 }); await home('signed'); await text('Preparing your food').waitFor();
    await page.evaluate(() => { for (const el of document.querySelectorAll('div[dir="auto"], input, textarea')) { const px = parseFloat(getComputedStyle(el).fontSize); if (px) el.style.fontSize = `${px * 1.3}px`; } });
    await shot('active-order-home-large-text'); await button('Explore menu').scrollIntoViewIfNeeded(); await shot('active-order-home-scroll');
    single = true; current = { ...initial, status: 'pending' }; await home('signed'); await text('Order received').waitFor(); await text('Waiting for restaurant confirmation.').waitFor(); await shot('active-order-pending-390');
    current = { ...initial, fulfillmentType: 'delivery', status: 'ready' }; await home('signed'); await text('Ready for dispatch').waitFor(); await text('On the way').waitFor(); await text('Delivered').waitFor(); await shot('active-order-delivery-390');
    current = { ...initial, status: 'ready' }; await home('signed'); await text('Ready for pickup').waitFor();
    current.status = 'delivered'; await tab('Menu').click(); await tab('Home').click(); await text('What are you craving?').waitFor(); await page.waitForTimeout(150); assert.equal(await text('ACTIVE ORDER').count(), 0);
    empty = true; await home('signed'); await text('What are you craving?').waitFor(); assert.equal(await text('ACTIVE ORDER').count(), 0); empty = false;
    current = { ...initial }; await home('signed'); await text('Preparing your food').waitFor(); outage = true; await tab('Menu').click(); await tab('Home').click(); await text('Status may be outdated.').waitFor(); await text('Preparing your food').waitFor(); await shot('active-order-offline-390');
    outage = false; current.status = 'ready'; await button('Retry order status').click(); await text('Ready for pickup').waitFor(); assert.equal(await text('Status may be outdated.').count(), 0);
    current = { ...initial, status: 'pending' }; await home('guest'); await text('Order received').waitFor(); await button('View order ' + initial.orderNumber).click(); await text('Latest restaurant status').waitFor(); assert.ok(page.url().includes('guest=1')); assert.ok(!page.url().includes('isolated-private-tracking'));
    const storage = await page.evaluate(() => JSON.stringify(localStorage)); assert.ok(!storage.includes('isolated-private-tracking'));
    revoked = true; await home('revoked'); await text('What are you craving?').waitFor(); await page.waitForTimeout(150); assert.equal(await text('ACTIVE ORDER').count(), 0); revoked = false;
    await home('recovery'); await button('Resolve unresolved order').waitFor(); assert.equal(await text('ACTIVE ORDER').count(), 0);
    expired = true; const guestReads = reads.filter(key => key.startsWith('orders/track/')).length; await home('expired'); await page.waitForFunction(async () => window.__profileTestVault && !(await window.__profileTestVault.read('session'))); assert.equal(await text('ACTIVE ORDER').count(), 0); assert.equal(reads.filter(key => key.startsWith('orders/track/')).length, guestReads); expired = false;
    // Accelerated browser clock verifies actual Home focus polling and cleanup.
    current = { ...initial }; await page.clock.install(); await home('signed'); await text('Preparing your food').waitFor();
    const historyReads = reads.filter(key => key === 'orders/my').length; const detailReads = reads.filter(key => key === 'orders/' + initial._id).length;
    await page.clock.fastForward(30000); await page.waitForTimeout(150); assert.equal(reads.filter(key => key === 'orders/my').length, historyReads); assert.equal(reads.filter(key => key === 'orders/' + initial._id).length, detailReads + 1);
    await tab('Menu').click(); const blurReads = reads.filter(key => key.startsWith('orders/')).length; await page.clock.fastForward(90000); await page.waitForTimeout(100); assert.equal(reads.filter(key => key.startsWith('orders/')).length, blurReads);
    await tab('Home').click(); await text('Preparing your food').waitFor(); await page.waitForTimeout(100); hold = true; await page.clock.fastForward(30000); await page.waitForTimeout(100); assert.ok(held);
    await tab('Profile').click(); await button('Log out').click(); await button('Sign in').click();
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(other.email); await page.getByRole('textbox', { name: 'Password', exact: true }).fill('FixturePassword1!'); await button('Sign in').last().click();
    await tab('Home').click(); await text(otherOrder.orderNumber).waitFor(); await held.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: initial }) }).catch(() => {}); await page.waitForTimeout(150);
    assert.equal(await text(initial.orderNumber).count(), 0); await text(otherOrder.orderNumber).waitFor();
    await home('guest-multiple'); await text('Preparing your food').waitFor(); await button('View all active orders (2)').click(); await text(initial.orderNumber).waitFor(); await text(older.orderNumber).waitFor(); await shot('active-order-guest-list-390');
    await home('guest'); await text('Preparing your food').waitFor(); const guestPolls = reads.filter(key => key.startsWith('orders/track/')).length; const guestHistory = reads.filter(key => key === 'orders/my').length;
    await page.clock.fastForward(119000); await page.waitForTimeout(100); assert.equal(reads.filter(key => key.startsWith('orders/track/')).length, guestPolls);
    await page.clock.fastForward(1000); await page.waitForTimeout(100); assert.equal(reads.filter(key => key.startsWith('orders/track/')).length, guestPolls + 1); assert.equal(reads.filter(key => key === 'orders/my').length, guestHistory);
    current.status = 'delivered'; await page.clock.fastForward(120000); await page.waitForTimeout(150); assert.equal(await text('ACTIVE ORDER').count(), 0);
    const finishedReads = reads.filter(key => key.startsWith('orders/track/')).length; await page.clock.fastForward(240000); await page.waitForTimeout(100); assert.equal(reads.filter(key => key.startsWith('orders/track/')).length, finishedReads);
    assert.deepEqual(errors, []); assert.deepEqual(writes, ['auth/mobile/login']);
    console.log('PASS: Active Home states, layouts/scroll/text scale, owner/guest navigation, filtered list, outage/retry, recovery separation, expiry, selective polling/blur, account switch and late response. No order writes.');
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, 'active-order-diagnostic-failure.png') });
    console.error('Diagnostic screen:', await page.locator('body').innerText()); throw error;
  } finally { await context.close(); await browser.close(); server.close(); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
