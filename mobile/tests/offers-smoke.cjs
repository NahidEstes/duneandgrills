// Browser diagnostic of the native screens through profile-harness.cjs.
// Every API request is intercepted. Fixtures follow the audited backend DTO;
// names/prices/codes here never enter the production app or a real database.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http'); const crypto = require('node:crypto');
const artifacts = path.resolve(__dirname, '../artifacts'); const root = path.join(artifacts, 'profile-harness-dist');
const snapshot = JSON.parse(fs.readFileSync(path.join(artifacts, 'catalog-snapshot.json'), 'utf8'));
const sourceItem = snapshot.menu.find(p => p.isAvailable && !p.customization?.enabled);
assert.ok(sourceItem, 'Read-only catalog fixture needs an available item');
const items = [sourceItem, { ...sourceItem, _id: 'fixture-side', name: 'Fixture side', price: 7 }, { ...sourceItem, _id: 'fixture-drink', name: 'Fixture drink', price: 6 }];
const user = { _id: 'offers-customer', name: 'Offer Customer', email: 'offers@example.test', phone: '+966501234567', role: 'customer' };
const token = 'isolated-offers-token';
const initialCombo = { _id: 'fixture-combo', name: 'Fixture meal bundle', description: 'A complete meal from the configured catalog.', image: items[0].image, category: 'Combos', productType: 'combo', isAvailable: true, status: 'published', comboPrice: 27, price: 27, regularPrice: 38, items: items.map(menuItem => ({ menuItem, quantity: 1 })) };
const baseOffer = { isActive: true, isFeatured: false, sortOrder: 0, startDate: new Date(Date.now() - 86400000).toISOString(), expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(), image: items[0].image, subtitle: '', description: '', promoCode: '', discountType: 'percentage', discountValue: 0, couponScope: 'order', applicableCategory: '', membersOnly: false, minimumTier: 'Bronze', minimumOrderAmount: 0, maximumDiscount: null, usageLimit: null, usageCount: 0, offerPrice: null, originalPrice: null, ctaLink: '/menu', orderProductType: 'combo', orderProduct: { productType: 'combo', product: initialCombo, quantity: 1 } };
const configured = [
  { ...baseOffer, _id: 'fixture-meal', title: 'Fixture meal offer', subtitle: 'Your complete meal.', isFeatured: true, offerPrice: 19 },
  { ...baseOffer, _id: 'fixture-coupon', title: 'Fixture category coupon', subtitle: 'Save on eligible catalog items.', image: items[1].image, promoCode: 'FIXTURE15', discountValue: 15, couponScope: 'category', applicableCategory: items[0].category, orderProduct: null, minimumOrderAmount: 20, maximumDiscount: 10 },
  { ...baseOffer, _id: 'fixture-member', title: 'Fixture member meal', subtitle: 'Combo plus a conditional coupon.', promoCode: 'MEMBER5', discountType: 'fixed', discountValue: 5, membersOnly: true, minimumTier: 'Gold' },
  { ...baseOffer, _id: 'fixture-expired', title: 'Expired hidden fixture', expiresAt: new Date(Date.now() - 1000).toISOString() },
  { ...baseOffer, _id: 'fixture-inactive', title: 'Inactive hidden fixture', isActive: false },
  { ...baseOffer, _id: 'fixture-capped', title: 'Exhausted hidden fixture', usageLimit: 1, usageCount: 1 },
];
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); const errors = []; const writes = []; let combo = { ...initialCombo }; let expired = false; let failure = ''; let empty = false; let denyMember = false; let expireCoupon = false;
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(({ user, token }) => {
    const scenario = new URL(location.href).searchParams.get('fixture'); const fixture = {};
    if (scenario === 'signed') fixture.session = { token, user, expiresAt: Date.now() + 86400000 };
    if (scenario === 'pending') fixture.pending = { version: 1, actor: 'guest', token: null, baseUrl: 'https://duneandgrills-testing-six.vercel.app/api', createdAt: new Date().toISOString(), payload: { idempotencyKey: 'isolated-offers-pending', fulfillmentType: 'pickup', paymentOption: 'cod', customer: { name: 'Guest fixture', phone: '+966501234567', email: '', address: '' }, items: [], kitchenNotes: 'Keep this request unchanged', couponCode: '' } };
    window.__profileFixture = fixture;
  }, { user, token });
  for (const item of items) {
    const url = new URL(item.image, 'https://duneandgrills-testing-six.vercel.app/').href;
    const image = path.join(artifacts, crypto.createHash('sha256').update(url).digest('hex') + '.image');
    if (fs.existsSync(image)) await context.route(url, route => route.fulfill({ contentType: 'image/jpeg', body: fs.readFileSync(image) }));
  }
  await context.route('**/api/**', async route => {
    const req = route.request(); const key = new URL(req.url()).pathname.replace(/^\/api\//, ''); const method = req.method();
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(status === 200 ? { data } : { message: data }) });
    if (method !== 'GET') writes.push({ key, method, body: req.postDataJSON(), authorization: req.headers().authorization });
    if (key === failure) return reply('Fixture outage', 503);
    if (key === 'offers') return reply(empty ? [] : configured);
    if (key.startsWith('offers/') && key !== 'offers/validate-coupon') {
      const offer = configured.find(o => o._id === key.split('/')[1]); return expired || !offer ? reply('No active offer', 404) : reply(offer);
    }
    if (key === 'combos') return reply([combo]);
    if (key.startsWith('combos/')) return reply(combo);
    if (key === 'offers/validate-coupon') {
      if (expireCoupon) { expireCoupon = false; return reply('Expired fixture session', 401); }
      const body = req.postDataJSON(); assert.ok(body.items.length);
      const sub = body.items.reduce((sum, line) => sum + (line.productType === 'combo' ? combo.comboPrice : items.find(p => p._id === line.productId)?.price || 0) * line.quantity, 0);
      if (expired) return reply('Coupon expired', 409);
      if (body.code === 'MEMBER5' && (!req.headers().authorization || denyMember)) return reply('Member tier insufficient', 403);
      if (body.code === 'FIXTURE15' && (sub < 20 || !body.items.some(l => l.productType === 'menuItem' && items.find(p => p._id === l.productId)?.category === items[0].category))) return reply('Minimum or category eligibility', 409);
      return reply({ originalSubtotal: sub, discountAmount: body.code === 'MEMBER5' ? 5 : Math.min(10, sub * .15) });
    }
    if (key.startsWith('auth/mobile/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token, user, expiresAt: Date.now() + 86400000 }) });
    if (key === 'auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user }) });
    if (key === 'profile/addresses' || key === 'orders/my') return reply([]);
    if (snapshot[key] !== undefined) return reply(snapshot[key]);
    return reply('Unprovided fixture data', 503);
  });
  const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true });
  const text = name => page.getByText(name, { exact: true }).filter({ visible: true }).locator('xpath=self::*[not(ancestor::*[@aria-hidden="true"])]');
  const shot = async name => { await page.waitForTimeout(250); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' fits'); await page.screenshot({ path: path.join(artifacts, name + '.png'), fullPage: true, animations: 'disabled' }); };
  const reset = async (route, scenario = 'guest') => { if (page.url().startsWith(base)) await page.evaluate(() => localStorage.clear()); await page.goto(base + route + (route.includes('?') ? '&' : '?') + 'fixture=' + scenario); };
  try {
    await reset('/home'); await text('What are you craving?').waitFor(); await button('See all').click(); await text('Your favourites. Better deals.').waitFor();
    await text('Fixture meal offer').waitFor(); assert.equal(await text('Expired hidden fixture').count(), 0); assert.equal(await text('Inactive hidden fixture').count(), 0); assert.equal(await text('Exhausted hidden fixture').count(), 0);
    await shot('offers-list-390'); await button('Coupons').click(); await text('Fixture category coupon').waitFor(); assert.equal(await text('Fixture meal offer').count(), 0); await text('Fixture member meal').waitFor();
    await button('Combo deals').click(); await text('Fixture meal offer').waitFor(); assert.equal(await text('Fixture category coupon').count(), 0); await text('Fixture member meal').waitFor();
    await button('View combo, Fixture meal offer').click(); await text('What’s included').waitFor(); await button('Increase quantity').click(); await shot('offers-combo-390');
    await button('Add to cart').click(); await text('2 combos added to your cart.').waitFor(); await button('View cart').click(); await text('Your cart').waitFor();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dg.cart.v1.guest'))); assert.equal(stored.length, 1); assert.equal(stored[0].quantity, 2); assert.equal(stored[0].unitPrice, 27); assert.equal(stored[0].product.productType, 'combo');
    await button('Pickup').click(); await button('Continue to checkout').click(); await page.getByRole('textbox', { name: 'Customer name', exact: true }).fill('Fixture Customer'); await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+966501234567'); await button('Review order').click(); await button(/Place cash order/).waitFor(); assert.equal(writes.filter(w => w.key === 'orders').length, 0);
    // Empty coupon suggestion, category navigation, then server eligibility.
    await reset('/cart?offer=fixture-coupon'); await text('Your cart is empty.').waitFor(); await page.waitForFunction(() => document.querySelector('[aria-label="Coupon code"]')?.value === 'FIXTURE15'); assert.equal(await text('Coupon applied. Confirmed again at checkout.').count(), 0); assert.ok(await button('Apply').isDisabled()); await shot('offers-empty-coupon-390');
    await button('Browse eligible products').click(); await text('Our menu').waitFor(); await button(`Add ${items[0].name}`).click(); await page.getByRole('button', { name: /View cart, 1 items/ }).click(); await text('Your cart').waitFor();
    // Quantity reaches minimum and manual revalidation works without claiming success early.
    while ((await page.evaluate(() => JSON.parse(localStorage.getItem('dg.cart.v1.guest'))))[0].quantity * items[0].price < 20) await button('Increase quantity').click();
    await button('Apply').click(); await text('Coupon applied. Confirmed again at checkout.').waitFor(); await button('Increase quantity').click(); assert.equal(await text('Coupon applied. Confirmed again at checkout.').count(), 0); await button('Decrease quantity').click(); assert.equal(await text('Coupon applied. Confirmed again at checkout.').count(), 0, 'Returning to prior quantities does not revive an old quote'); await button('Apply').click(); await text('Coupon applied. Confirmed again at checkout.').waitFor();
    await button('Remove coupon').click(); assert.equal(await page.getByRole('textbox', { name: 'Coupon code', exact: true }).inputValue(), '');
    const beforeReuse = writes.filter(w => w.key === 'offers/validate-coupon').length;
    await page.getByRole('tab', { name: 'Home', exact: true }).click(); await button('See all').click(); await button('Use offer, Fixture category coupon').click(); await text('Coupon applied. Confirmed again at checkout.').waitFor(); assert.ok(writes.filter(w => w.key === 'offers/validate-coupon').length > beforeReuse, 'Same offer can be selected again after removal and is revalidated');
    // Member intent survives account switch/login reset, is fetched again, and uses bearer + real combo line.
    await reset('/cart?offer=fixture-member'); await button('Sign in to use this offer').click(); await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email); await page.getByRole('textbox', { name: 'Password', exact: true }).fill('FixturePassword1!'); await button('Sign in').last().click();
    await page.waitForFunction(() => document.querySelector('[aria-label="Coupon code"]')?.value === 'MEMBER5'); await button('Browse eligible products').click(); await text('What’s included').waitFor(); await button('Add to cart').click(); await text('1 combo added to your cart.').waitFor(); await button('View cart').click(); await text('Coupon applied. Confirmed again at checkout.').waitFor();
    const member = writes.findLast(w => w.key === 'offers/validate-coupon'); assert.equal(member.authorization, 'Bearer ' + token); assert.deepEqual(member.body.items, [{ productId: combo._id, productType: 'combo', quantity: 1, customization: { selectedAddOns: [], spiceLevel: '', note: '' } }]);
    denyMember = true; await button('Increase quantity').click(); await button('Apply').click(); await text('Your account does not meet this offer’s membership requirements.').waitFor(); denyMember = false;
    await button('Remove coupon').click(); await page.getByRole('textbox', { name: 'Coupon code', exact: true }).fill('MEMBER5'); expireCoupon = true; await button('Apply').click(); await button('Sign in to use this coupon').waitFor(); assert.equal(await text('Coupon applied. Confirmed again at checkout.').count(), 0); assert.ok(await button('Apply').isDisabled()); assert.equal(await page.evaluate(() => localStorage.getItem('dg.cart.owner.v1')), user._id);
    await button('Sign in to use this coupon').click(); await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email); await page.getByRole('textbox', { name: 'Password', exact: true }).fill('FixturePassword1!'); await button('Sign in').last().click(); await text('My profile').waitFor();
    await page.getByRole('tab', { name: 'Profile', exact: true }).click(); await button('Log out').click(); await page.goto(base + '/cart'); await text('Your cart is empty.').waitFor(); assert.equal(await page.getByRole('textbox', { name: 'Coupon code', exact: true }).inputValue(), '');
    // Re-fetch prevents stale pricing. A second customer action is required.
    await reset('/combo/fixture-combo?offer=fixture-meal'); await text('What’s included').waitFor(); combo = { ...combo, comboPrice: 31, price: 31 }; await button('Add to cart').click(); await text('The combo price changed. Review the current total before adding again.').waitFor(); assert.equal(await page.evaluate(() => localStorage.getItem('dg.cart.v1.guest')), null); await button('Add to cart').click(); await text('1 combo added to your cart.').waitFor();
    await reset('/combo/fixture-combo?offer=fixture-meal'); await text('What’s included').waitFor(); expired = true; await button('Add to cart').click(); await button('Continue at current price · SAR 31.00').waitFor(); assert.ok(await button('Add to cart').isDisabled()); await button('Continue at current price · SAR 31.00').click(); await button('Add to cart').click(); await text('1 combo added to your cart.').waitFor(); expired = false;
    combo = { ...initialCombo, items: [{ menuItem: { ...items[0], isAvailable: false }, quantity: 1 }] }; await reset('/combo/fixture-combo'); await text('This combo or an included item is currently unavailable.').waitFor(); assert.ok(await button('Add to cart').isDisabled()); combo = { ...initialCombo };
    await reset('/item/fixture-combo?type=combo'); await text('What’s included').waitFor(); assert.match(page.url(), /\/combo\/fixture-combo/);
    // Lock prevents both combo and selected coupon mutations and preserves pending payload.
    await reset('/combo/fixture-combo?offer=fixture-member', 'pending'); await text('What’s included').waitFor(); assert.ok(await button('Add to cart').isDisabled()); assert.ok(await button('Increase quantity').isDisabled()); const pending = await page.evaluate(async () => window.__profileTestVault.read('pending')); assert.equal(pending.payload.kitchenNotes, 'Keep this request unchanged');
    await reset('/cart?offer=fixture-coupon', 'pending'); await text('Your cart').waitFor(); await text('Checking selected offer…').waitFor({ state: 'hidden' }); assert.equal(await page.getByRole('textbox', { name: 'Coupon code', exact: true }).inputValue(), ''); assert.ok(await button('Apply').isDisabled());
    failure = 'offers'; await reset('/offers'); await button('Retry').waitFor(); failure = ''; await button('Retry').click(); await text('Fixture meal offer').waitFor(); empty = true; await reset('/offers'); await text('No current offers').waitFor(); empty = false;
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 }); await reset('/home'); await text('Today’s offers').waitFor(); await text('Today’s offers').evaluate(el => el.scrollIntoView({ block: 'start' })); await shot(`offers-home-${width}`);
      await reset('/offers'); await text('Fixture meal offer').waitFor(); await shot(`offers-list-${width}`);
      await reset('/combo/fixture-combo?offer=fixture-meal'); await text('What’s included').waitFor(); await shot(`offers-combo-${width}`); await text('Quantity').scrollIntoViewIfNeeded(); await shot(`offers-combo-bottom-${width}`);
      const footer = await button('Add to cart').boundingBox(); const quantity = await text('Quantity').boundingBox(); assert.ok(footer.y + footer.height <= 844 && quantity.y + quantity.height <= footer.y, 'Measured footer stays visible without covering content');
    }
    await page.evaluate(() => {
      const values = [...document.querySelectorAll('div[dir="auto"], input, textarea')].map(node => { const style = getComputedStyle(node); const size = parseFloat(style.fontSize); return { node, size: size * 1.3, line: (parseFloat(style.lineHeight) || size * 1.2) * 1.3 }; });
      for (const { node, size, line } of values) { node.style.fontSize = `${size}px`; node.style.lineHeight = `${line}px`; }
    }); await text('Quantity').scrollIntoViewIfNeeded(); await shot('offers-combo-large-text-390');
    const largeFooter = await button('Add to cart').boundingBox(); const largeQuantity = await text('Quantity').boundingBox(); assert.ok(largeQuantity.y + largeQuantity.height <= largeFooter.y && largeFooter.y + largeFooter.height <= 844, 'Enlarged text stays above the measured footer');
    assert.deepEqual(errors, []); assert.ok(writes.every(w => w.key === 'offers/validate-coupon' || w.key.startsWith('auth/mobile/')), 'No order/profile writes');
    console.log('Offers diagnostic passed: navigation, dual filters, authoritative combo line, coupon eligibility/login/account, stale/expired/unavailable, recovery lock, small/typical/large text footer. All API writes intercepted.');
  } catch (e) { await page.screenshot({ path: path.join(artifacts, 'offers-smoke-failure.png'), fullPage: true }); console.error(await page.locator('body').innerText()); throw e; }
  finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; server.close(); });
