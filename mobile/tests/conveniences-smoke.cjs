// Real app/provider/routes in the isolated profile harness. All APIs are fixtures;
// only native SecureStore and Share adapters are substituted outside the app.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http');
const artifacts = path.resolve(__dirname, '../artifacts'); const root = path.join(artifacts, 'profile-harness-dist');
const snapshot = JSON.parse(fs.readFileSync(path.join(artifacts, 'catalog-snapshot.json')));
const user = { _id: 'convenience-owner', name: 'Convenience Customer', email: 'owner@example.test', phone: '+966501234567', role: 'customer' };
const other = { ...user, _id: 'second-owner', name: 'Second Customer', email: 'second@example.test' };
const cheese = { _id: 'fixture-cheese', name: 'Cheese', price: 4 };
const food = { _id: 'fixture-food', productType: 'menuItem', name: 'Fixture Food', description: 'Freshly prepared fixture meal', image: '', category: 'Burgers', price: 25, isAvailable: true, isFeatured: true, addOns: [cheese], customization: { enabled: true, spice: { enabled: true, options: ['mild', 'hot'], default: 'mild' }, groups: [{ name: 'Cheese choice', selectionType: 'single', minSelections: 1, maxSelections: 1, addOns: [cheese] }] } };
const plain = { ...food, _id: 'plain-food', name: 'Plain Fixture Food', price: 10, customization: { enabled: false }, addOns: [] };
const combo = { ...plain, _id: 'fixture-combo', name: 'Fixture Combo', productType: 'combo', status: 'published', comboPrice: 29, regularPrice: 35, items: [{ quantity: 1, menuItem: plain }] };
const offer = { _id: 'fixture-offer', title: 'Fixture Public Offer', subtitle: 'A fresh meal', description: 'Unverified 90% off', isActive: true, startDate: '2020-01-01', expiresAt: '2099-01-01', promoCode: 'FIXTURE', discountType: 'fixed', discountValue: 1, couponScope: 'order', minimumOrderAmount: 0, orderProduct: null, image: '' };
const order = { _id: 'fixture-order', orderNumber: 'DG-CONVENIENCE-1', status: 'Completed', paymentStatus: 'Paid', fulfillmentType: 'pickup', totalAmount: 20, subtotal: 20, deliveryFee: 0, discountAmount: 0, createdAt: new Date().toISOString(), items: [] };
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
  let repeatEmpty = false; let repeatHold = false; let heldRepeat; let favoritesHold = false; let heldFavorites; let favoritesFailure = false; let hidden = false; let itemUnavailable = false; let offerExpired = false;
  const favorites = { [user._id]: new Set(), [other._id]: new Set() }; const writes = []; const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await context.addInitScript(({ user, plain }) => {
    localStorage.clear(); const scenario = new URL(location.href).searchParams.get('fixture'); const fixture = {};
    if (scenario !== 'guest') fixture.session = { token: 'fixture-owner-token', user, expiresAt: Date.now() + 86400000 };
    if (scenario === 'cart' || scenario === 'pending') {
      const selection = { selectedAddOns: [], spiceLevel: '', note: '' }; const line = { key: JSON.stringify(['menuItem', plain._id, selection]), product: plain, selection, quantity: 1, unitPrice: plain.price };
      localStorage.setItem('dg.cart.owner.v1', user._id); localStorage.setItem('dg.cart.v1.' + user._id, JSON.stringify([line]));
    }
    if (scenario === 'pending') fixture.pending = { version: 1, actor: user._id, token: 'fixture-owner-token', baseUrl: 'https://duneandgrills-testing-six.vercel.app/api', createdAt: new Date().toISOString(), payload: { idempotencyKey: 'fixture-pending-convenience', fulfillmentType: 'pickup', paymentOption: 'cod', customer: { name: user.name, phone: user.phone, email: user.email, address: '' }, items: [], kitchenNotes: '', couponCode: '' } };
    window.__profileFixture = fixture;
  }, { user, plain });
  await context.route('**/api/**', async route => {
    const request = route.request(); const key = new URL(request.url()).pathname.replace(/^\/api\//, ''); const method = request.method(); const owner = request.headers().authorization === 'Bearer fixture-second-token' ? other : user;
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ data, ...(status >= 400 ? { message: 'Fixture service unavailable' } : {}) }) });
    if (method !== 'GET') writes.push({ key, method, actor: owner._id });
    if (key === 'auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: owner }) });
    if (key === 'auth/mobile/login') { const selected = request.postDataJSON().email === other.email ? other : user; return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user: selected, token: selected === other ? 'fixture-second-token' : 'fixture-owner-token', expiresAt: Date.now() + 86400000 }) }); }
    if (key === 'profile/favorites') {
      assert.ok(request.headers().authorization); const data = hidden ? [] : [food, plain].filter(p => favorites[owner._id].has(p._id));
      if (favoritesHold && owner === user) { favoritesHold = false; heldFavorites = { route, data }; return; }
      return reply(data, favoritesFailure ? 503 : 200);
    }
    if (key.startsWith('profile/favorites/')) {
      assert.ok(request.headers().authorization); if (favoritesFailure) return reply(null, 503);
      const id = key.split('/')[2]; if (method === 'POST') favorites[owner._id].add(id); else if (method === 'DELETE') favorites[owner._id].delete(id); else assert.fail('Unexpected favourite method');
      return reply(method === 'DELETE' ? id : [food, plain].find(p => p._id === id), method === 'POST' ? 201 : 200);
    }
    if (key === 'orders/my') { assert.ok(request.headers().authorization); return reply([order]); }
    if (key === 'rewards/me') return reply({ pointsBalance: 0, pointsDebt: 0, pointsPerSAR: 10, policy: { earnAfter: 'completed_and_paid', pointsExpire: false }, history: [] });
    if (key === 'orders/fixture-order/repeat') {
      assert.equal(method, 'POST'); assert.ok(request.headers().authorization);
      const result = { data: repeatEmpty ? [] : [{ _id: food._id, productType: 'menuItem', name: food.name, quantity: 2, price: 20, selectedAddOns: [{ _id: cheese._id, quantity: 1 }], spiceLevel: 'mild', note: 'PRIVATE HISTORICAL NOTE' }], warnings: ['Sold-out historical item skipped.'] };
      if (repeatHold) { repeatHold = false; heldRepeat = { route, result }; return; }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    }
    if (key === 'orders/fixture-order') return reply(order);
    if (key === 'menu') return reply([food, plain]); if (key === 'combos') return reply([combo]); if (key === 'offers') return reply([offer]);
    if (key.startsWith('menu/')) return reply({ ...(key.endsWith(plain._id) ? plain : food), isAvailable: !itemUnavailable });
    if (key === 'combos/' + combo._id) return reply(combo);
    if (key === 'offers/' + offer._id) return reply({ ...offer, expiresAt: offerExpired ? '2020-01-01' : offer.expiresAt });
    if (key === 'profile/addresses') return reply([]);
    if (snapshot[key] !== undefined) return reply(snapshot[key]);
    assert.equal(method, 'GET', 'Unmocked mutations cannot reach live data'); return reply(null, 404);
  });
  const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true }).locator('xpath=self::*[not(ancestor::*[@aria-hidden="true"])]');
  const text = name => page.getByText(name, { exact: true }).filter({ visible: true }).locator('xpath=self::*[not(ancestor::*[@aria-hidden="true"])]');
  const tab = name => page.getByRole('tab', { name, exact: true });
  const cart = () => page.evaluate(() => JSON.parse(localStorage.getItem('dg.cart.v1.convenience-owner') || '[]'));
  const shot = async name => { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' fits'); await page.screenshot({ path: path.join(artifacts, name + '.png'), animations: 'disabled' }); };
  const login = async owner => { await page.getByRole('textbox', { name: 'Email', exact: true }).fill(owner.email); await page.getByRole('textbox', { name: 'Password', exact: true }).fill('FixturePassword1!'); await button('Sign in').last().click(); };
  try {
    await page.goto(base + '/orders?fixture=cart'); await button('Order again ' + order.orderNumber).waitFor(); const original = await cart(); assert.equal(original.length, 1);
    await button('Order again ' + order.orderNumber).click(); await text('Your cart already has items').waitFor(); await shot('conveniences-merge-choice-390'); await button('Cancel').click(); assert.deepEqual(await cart(), original); assert.equal(writes.length, 0);
    await button('Order again ' + order.orderNumber).click(); await button('Merge with cart').click(); await text('Your cart').waitFor();
    const merged = await cart(); assert.equal(merged.length, 2); assert.equal(merged[1].unitPrice, 29); assert.equal(merged[1].quantity, 2); assert.equal(merged[1].selection.note, ''); await text(/Skipped items or changes/).waitFor(); await shot('conveniences-reorder-cart-390');
    await page.goto(base + '/orders?fixture=cart'); repeatEmpty = true; await button('Order again ' + order.orderNumber).click(); await button('Replace cart').click(); await text('No eligible items could be added. Your cart is unchanged.\nSold-out historical item skipped.').waitFor(); assert.deepEqual(await cart(), original);
    repeatEmpty = false; await button('Order again ' + order.orderNumber).click(); await button('Replace cart').click(); await text('Your cart').waitFor(); assert.equal((await cart()).length, 1); assert.equal((await cart())[0].product._id, food._id);
    await page.goto(base + '/order/' + order._id + '?fixture=signed'); await button('Order again').waitFor(); repeatHold = true; const before = writes.length; await button('Order again').dispatchEvent('click'); await page.waitForTimeout(100);
    assert.equal(writes.length, before + 1); assert.ok(await button('Checking current menu…').isDisabled()); await button('Checking current menu…').dispatchEvent('click'); assert.equal(writes.length, before + 1); await heldRepeat.route.fulfill({ contentType: 'application/json', body: JSON.stringify(heldRepeat.result) }); await text('Your cart').waitFor();
    await page.goto(base + '/orders?fixture=pending'); await button('Order again ' + order.orderNumber).waitFor(); assert.ok(await button('Order again ' + order.orderNumber).isDisabled()); assert.equal((await cart())[0].product._id, plain._id);
    // Real provider's expected-cart check prevents overwriting a concurrent add.
    await page.goto(base + '/orders?fixture=signed'); await button('Order again ' + order.orderNumber).waitFor(); repeatHold = true; await button('Order again ' + order.orderNumber).dispatchEvent('click'); await page.waitForTimeout(100); await tab('Menu').click(); await button('Add ' + plain.name).click(); assert.equal((await cart()).length, 1);
    await heldRepeat.route.fulfill({ contentType: 'application/json', body: JSON.stringify(heldRepeat.result) }); await tab('Orders').click(); await text('Your cart changed. Review it before trying Order again.').waitFor(); assert.equal((await cart()).length, 1); assert.equal((await cart())[0].product._id, plain._id);
    await page.goto(base + '/home?fixture=signed'); await button('Save to favourites, ' + food.name).waitFor(); await button('Save to favourites, ' + food.name).click(); await button('Remove from favourites, ' + food.name).waitFor();
    await tab('Menu').click(); await button('Remove from favourites, ' + food.name).waitFor(); await tab('Profile').click(); await button('Favourite foods').click(); await text('Favourite foods').first().waitFor(); await button('Remove from favourites, ' + food.name).waitFor(); await shot('conveniences-favourites-390');
    await button('Add ' + food.name).click(); await button('Share ' + food.name).waitFor(); assert.ok(page.url().includes('/item/' + food._id)); await text('Cheese choice').waitFor();
    await button('Share ' + food.name).click(); let shares = await page.evaluate(() => window.__shareCalls); assert.equal(shares[0].message, `${food.name}\n${food.description}\nhttps://duneandgrills-testing-six.vercel.app/item/${food._id}`);
    await page.evaluate(() => { window.__shareCancel = true; }); await button('Share ' + food.name).click(); assert.equal(await text(/sent successfully/i).count(), 0);
    favoritesFailure = true; await button('Remove from favourites, ' + food.name).click(); await text('The restaurant service is temporarily unavailable. Please try again shortly.').waitFor(); await button('Remove from favourites, ' + food.name).waitFor(); favoritesFailure = false;
    await button('Remove from favourites, ' + food.name).click(); await button('Save to favourites, ' + food.name).waitFor(); assert.equal(favorites[user._id].size, 0);
    await page.goto(base + '/favorites?fixture=signed'); await text('No available favourite foods').waitFor();
    favorites[user._id].add(food._id); favoritesFailure = true; await page.goto(base + '/favorites?fixture=signed'); await text('The restaurant service is temporarily unavailable. Please try again shortly.').waitFor(); favoritesFailure = false; await button('Retry').click(); await button('Remove from favourites, ' + food.name).waitFor();
    hidden = true; const deletes = writes.filter(w => w.method === 'DELETE').length; await page.goto(base + '/favorites?fixture=signed'); await text('No available favourite foods').waitFor(); assert.equal(favorites[user._id].size, 1); assert.equal(writes.filter(w => w.method === 'DELETE').length, deletes); hidden = false;
    // Guest login preserves the intended item but requires an explicit second tap.
    await page.goto(base + '/item/' + food._id + '?fixture=guest'); await button('Save to favourites, ' + food.name).click(); await text('Welcome back').waitFor(); const saves = writes.filter(w => w.key.startsWith('profile/favorites/')).length; await login(other);
    await text('Signed in as Second Customer. Tap the heart to save this food to this account.').waitFor(); await button('Save to favourites, ' + food.name).waitFor(); assert.equal(writes.filter(w => w.key.startsWith('profile/favorites/')).length, saves);
    await button('Save to favourites, ' + food.name).click(); await button('Remove from favourites, ' + food.name).waitFor(); assert.ok(favorites[other._id].has(food._id));
    // A delayed owner GET cannot update the account that logs in later.
    favoritesHold = true; await page.goto(base + '/profile?fixture=signed'); await button('Log out').waitFor(); await page.waitForTimeout(100); assert.ok(heldFavorites); await button('Log out').click(); await button('Sign in').click(); await login(other); await tab('Profile').click(); await button('Favourite foods').click(); await button('Remove from favourites, ' + food.name).waitFor();
    await heldFavorites.route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [plain] }) }).catch(() => {}); await page.waitForTimeout(100); assert.equal(await text(plain.name).count(), 0);
    await page.goto(base + '/combo/' + combo._id + '?fixture=signed'); await button('Share ' + combo.name).click(); shares = await page.evaluate(() => window.__shareCalls); assert.ok(shares[0].message.endsWith('/combo/' + combo._id));
    await page.goto(base + '/offer/' + offer._id + '?fixture=signed'); await button('Share ' + offer.title).click(); shares = await page.evaluate(() => window.__shareCalls); assert.equal(shares[0].message, `${offer.title}\nhttps://duneandgrills-testing-six.vercel.app/offer/${offer._id}`); assert.ok(!shares[0].message.includes('90%'));
    offerExpired = true; await page.goto(base + '/offer/' + offer._id + '?fixture=signed'); await text('This offer is expired or unavailable. Explore the current menu and offers.').waitFor(); assert.equal(await button('Share ' + offer.title).count(), 0);
    itemUnavailable = true; await page.goto(base + '/item/' + food._id + '?fixture=signed'); await text(food.name + ' is unavailable').waitFor(); assert.ok(await page.getByRole('button', { name: /^Add to cart/ }).isDisabled()); itemUnavailable = false;
    await page.setViewportSize({ width: 320, height: 740 }); await page.goto(base + '/favorites?fixture=signed'); await button('Remove from favourites, ' + food.name).waitFor(); await shot('conveniences-favourites-320');
    await page.evaluate(() => { for (const node of document.querySelectorAll('div[dir="auto"]')) { const size = parseFloat(getComputedStyle(node).fontSize); node.style.fontSize = size * 1.3 + 'px'; } }); await shot('conveniences-favourites-large-text-320');
    assert.deepEqual(errors, []); assert.ok(writes.every(w => w.key === 'auth/mobile/login' || w.key.startsWith('profile/favorites/') || w.key === 'orders/fixture-order/repeat'));
    console.log('PASS conveniences: current-price customized repeat; cancel/merge/replace/empty preservation; duplicate/pending locks; shared favourites CRUD/failure/hidden-history/guest explicit login/account isolation; public item/combo/offer share and cancellation adapter; expired/unavailable states; 320/390 and 130% text. No live writes.');
  } catch (error) { await page.screenshot({ path: path.join(artifacts, 'conveniences-failure.png') }); console.error(await page.locator('body').innerText()); throw error; }
  finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
