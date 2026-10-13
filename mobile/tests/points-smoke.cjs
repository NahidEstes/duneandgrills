// Actual routes, secure-auth provider and points resource in the isolated
// profile harness. Every API request is intercepted; no live loyalty writes.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http');
const artifacts = path.resolve(__dirname, '../artifacts'); const root = path.join(artifacts, 'profile-harness-dist');
const snapshot = JSON.parse(fs.readFileSync(path.join(artifacts, 'catalog-snapshot.json')));
const user = { _id: 'points-owner', name: 'Points Customer', email: 'points@example.test', phone: '+966501234567', role: 'customer' };
const other = { ...user, _id: 'second-points-owner', name: 'Second Customer', email: 'second@example.test' };
const orderId = '123456789012345678901234';
const order = { _id: orderId, orderNumber: 'DG-POINTS-1', status: 'delivered', paymentStatus: 'paid', fulfillmentType: 'pickup', totalAmount: 20, subtotal: 20, deliveryFee: 0, discountAmount: 0, createdAt: '2026-10-12T22:30:00Z', items: [] };
const history = Array.from({ length: 25 }, (_, i) => ({ _id: 'ledger-' + i, type: ['EARN', 'REDEEM', 'REVERSAL', 'REVERSAL'][i % 4], points: [100, -50, 30, -20][i % 4], createdAt: new Date(Date.parse('2026-10-12T22:30:00Z') - i * 3600000).toISOString(), order: i === 0 ? { _id: orderId, orderNumber: order.orderNumber } : i === 1 ? { orderNumber: 'LEGACY-NO-LINK' } : null, sourceKey: 'PRIVATE_LEDGER_SOURCE', balanceAfter: 991, description: 'INTERNAL_AUDIT_DESCRIPTION' }));
const account = { pointsBalance: 1250, pointsDebt: 50, pointsPerSAR: 7, policy: { earnAfter: 'completed_and_paid', pointsExpire: false, reservationMinutes: 30 }, history: [...history].reverse(), membership: { tier: 'INTERNAL_TIER' }, activeRedemption: { code: 'PRIVATE_RESERVATION' } };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
  res.setHeader('Content-Type', { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); const context = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await context.newPage();
  let data = structuredClone(account); let outage = false; let expired = false; let hold = false; let held; const reads = []; const writes = []; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({ user }) => { localStorage.clear(); const fixture = {}; if (new URL(location.href).searchParams.get('fixture') !== 'guest') fixture.session = { token: 'points-owner-token', user, expiresAt: Date.now() + 86400000 }; window.__profileFixture = fixture; }, { user });
  await context.route('**/api/**', async route => {
    const request = route.request(); const key = new URL(request.url()).pathname.replace(/^\/api\//, ''); const owner = request.headers().authorization === 'Bearer points-second-token' ? other : user;
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, ...(status >= 400 ? { message: 'Private server diagnostic' } : {}) }) });
    if (request.method() !== 'GET') { writes.push(key); assert.equal(key, 'auth/mobile/login', 'Points feature never mutates loyalty or orders'); return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'points-second-token', user: other, expiresAt: Date.now() + 86400000 }) }); }
    reads.push({ key, authorization: request.headers().authorization });
    if (key === 'auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: owner }) });
    if (key === 'rewards/me') {
      assert.ok(request.headers().authorization, 'Points reads are authenticated');
      if (hold && owner === user) { hold = false; held = { route, data: structuredClone(data) }; return; }
      if (expired) return reply(null, 401); if (outage) return reply(null, 503);
      return reply(owner === other ? { ...account, pointsBalance: 5, pointsDebt: 0, pointsPerSAR: 12, history: [history[0]] } : data);
    }
    if (key === 'orders/' + orderId) { assert.ok(request.headers().authorization); return reply(order); }
    if (key === 'orders/my') return reply([order]);
    if (['profile/favorites', 'profile/addresses', 'offers'].includes(key)) return reply([]);
    if (snapshot[key] !== undefined) return reply(snapshot[key]); return reply(null, 404);
  });
  const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true }).locator('xpath=self::*[not(ancestor::*[@aria-hidden="true"])]');
  const text = name => page.getByText(name, { exact: true }).filter({ visible: true }).locator('xpath=self::*[not(ancestor::*[@aria-hidden="true"])]');
  const entry = () => page.getByRole('button', { name: /^My points,/ }).filter({ visible: true }); const tab = name => page.getByRole('tab', { name, exact: true });
  const shot = async name => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' fits'); await page.screenshot({ path: path.join(artifacts, name + '.png'), animations: 'disabled' }); };
  try {
    await page.goto(base + '/profile?fixture=signed'); await button('My points, 1,250 available points').waitFor(); await entry().scrollIntoViewIfNeeded(); await shot('points-profile-390'); await entry().click(); await text('Available points').waitFor(); await text('1,250').waitFor();
    await text('Earn 7 points per eligible SAR 1 after your order is completed and paid.').waitFor(); await text('Accumulated points do not expire.').waitFor(); await text('Some points were adjusted after a refund. Future earned points will first cover this adjustment.').waitFor(); await text('10 shown').waitFor();
    await text('13 Oct 2026, 01:30').waitFor(); await text('+100 points').first().waitFor(); await text('−50 points').first().waitFor(); await text('Points returned').first().waitFor(); await text('Points adjusted after a refund').first().waitFor(); await shot('points-balance-rules-390');
    const visible = await page.locator('body').innerText(); assert.doesNotMatch(visible, /PRIVATE_LEDGER|INTERNAL_AUDIT|INTERNAL_TIER|PRIVATE_RESERVATION|balanceAfter|cash debt/);
    await button('Load more').click(); await text('20 shown').waitFor(); await button('Load more').click(); await text('25 shown').waitFor(); assert.equal(await button('Load more').count(), 0); await shot('points-history-390');
    await page.getByRole('button', { name: /^View order DG-POINTS-1,/ }).click(); await text('Latest restaurant status').waitFor(); assert.ok(page.url().includes('/order/' + orderId)); await page.goBack(); await text('Available points').waitFor();
    // Returning from order details/focusing Points uses a fresh read; temporary
    // outages retain the known value rather than inventing a zero balance.
    outage = true; await button('Refresh points').click(); await text('Points may be outdated. Your last known balance is shown. Pull to refresh or retry.').waitFor(); await text('1,250').waitFor(); await shot('points-stale-390');
    outage = false; data.pointsBalance = 1500; await button('Retry').click(); await text('1,500').waitFor(); assert.equal(await text('Points may be outdated. Your last known balance is shown. Pull to refresh or retry.').count(), 0);
    // Initial error and useful retry, followed by zero/empty/debt presentation.
    outage = true; await page.goto(base + '/points?fixture=signed'); await text('The restaurant service is temporarily unavailable. Please try again shortly.').waitFor(); assert.equal(await text('Available points').count(), 0);
    outage = false; data = { ...account, pointsBalance: 0, pointsDebt: 15, history: [] }; await button('Retry').click(); await text('0').waitFor(); await text('No points activity yet.').waitFor(); await text('Points adjustment').waitFor(); assert.equal(await button('Load more').count(), 0); await shot('points-zero-empty-390');
    data = { ...account, pointsDebt: 0, history: Array.from({ length: 100 }, (_, i) => ({ ...history[i % history.length], createdAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(), order: null })) }; await page.goto(base + '/points?fixture=signed'); await text('10 shown').waitFor();
    for (let count = 20; count <= 100; count += 10) { await button('Load more').click(); await text(count + ' shown').waitFor(); } assert.equal(await button('Load more').count(), 0); await text('Up to the 100 most recent records are supplied by the restaurant. This is not complete lifetime history.').waitFor();
    data = structuredClone(account); await page.goto(base + '/points?fixture=guest'); await text('Sign in to view your points and recent activity.').waitFor(); assert.equal(await text('1,250').count(), 0); const guestReads = reads.filter(r => r.key === 'rewards/me').length; await page.waitForTimeout(100); assert.equal(reads.filter(r => r.key === 'rewards/me').length, guestReads); await shot('points-guest-390');
    await page.goto(base + '/profile?fixture=guest'); await button('My points, Sign in to view points').waitFor();
    expired = true; await page.goto(base + '/points?fixture=signed'); await text('Sign in to view your points and recent activity.').waitFor(); assert.equal(await text('1,250').count(), 0); expired = false;
    // Known value, held old-owner refresh, then real logout/sign-in transition.
    await page.goto(base + '/profile?fixture=signed'); await button('My points, 1,250 available points').waitFor(); await tab('Menu').click(); hold = true; await tab('Profile').click(); await page.waitForTimeout(100); assert.ok(held); await button('Log out').click(); await button('My points, Sign in to view points').waitFor(); assert.equal(await text('1,250 available points').count(), 0);
    await button('Sign in').click(); await page.getByRole('textbox', { name: 'Email', exact: true }).fill(other.email); await page.getByRole('textbox', { name: 'Password', exact: true }).fill('FixturePassword1!'); await button('Sign in').last().click(); await button('My points, 5 available points').waitFor();
    await held.route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: held.data }) }).catch(() => {}); await page.waitForTimeout(100); await button('My points, 5 available points').waitFor(); await entry().click(); await text('5').waitFor(); await text('Earn 12 points per eligible SAR 1 after your order is completed and paid.').waitFor(); await text('1 shown').waitFor();
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('pointsBalance')), false, 'No loyalty persistence added');
    for (const width of [320, 390]) { await page.setViewportSize({ width, height: 740 }); await shot('points-second-account-' + width); }
    await page.evaluate(() => { for (const node of document.querySelectorAll('div[dir="auto"]')) { const size = parseFloat(getComputedStyle(node).fontSize); node.style.fontSize = size * 1.3 + 'px'; } }); await shot('points-large-text-390'); await text('Recent activity').scrollIntoViewIfNeeded(); await shot('points-large-text-history-390');
    assert.deepEqual(errors, []); assert.ok(reads.filter(r => r.key === 'rewards/me').every(r => r.authorization)); assert.deepEqual(writes, ['auth/mobile/login']);
    console.log('PASS My points: actual Profile entry/screen/back/order navigation; dynamic policy/positive/zero/debt; signed earn/redeem/both reversals/Riyadh date; empty/10→20→25/100 cap; initial and stale outage/retry; guest/expiry/logout/switch/late isolation; no loyalty persistence or mutations; 320/390/enlarged text. All APIs intercepted.');
  } catch (error) { await page.screenshot({ path: path.join(artifacts, 'points-failure.png') }); console.error(await page.locator('body').innerText()); throw error; }
  finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
