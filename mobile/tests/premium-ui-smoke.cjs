// Exercise the seven premium screens in the isolated native-storage harness.
// Every API/image request below is a local fixture; no restaurant data is written.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const artifacts = path.resolve(__dirname, '../artifacts');
const root = path.join(artifacts, 'profile-harness-dist');
const snapshot = JSON.parse(fs.readFileSync(path.join(artifacts, 'catalog-snapshot.json'), 'utf8'));
const photos = snapshot.menu.filter(item => item.image);
const photo = index => photos.length ? photos[index % photos.length].image : '';
const user = { _id: 'premium-ui-customer', name: 'Ahmed Ali', email: 'ui@example.test', phone: '+966500000000', role: 'customer' };
const regular = { _id: 'regular', name: 'Regular', price: 0 };
const large = { _id: 'large', name: 'Large', price: 14 };
const garlic = { _id: 'garlic', name: 'Garlic dip', price: 0 };
const spicy = { _id: 'spicy', name: 'Spicy sauce', price: 0 };
const dish = { _id: 'premium-grill', name: 'Mixed Grill', description: 'Flame-grilled skewers, warm pita and house dips.', image: photo(0), price: 42, category: 'Grills', isAvailable: true, isFeatured: true, productType: 'menuItem', customization: { enabled: true, groups: [
  { name: 'Choose portion size', selectionType: 'single', minSelections: 1, maxSelections: 1, addOns: [regular, large] },
  { name: 'Choose your dip', selectionType: 'single', minSelections: 1, maxSelections: 1, addOns: [garlic, spicy] },
] } };
const burger = { ...dish, _id: 'premium-burger', name: 'Chicken Burger', category: 'Burgers', description: 'Grilled chicken, fresh lettuce and house sauce.', image: photo(1), price: 26, customization: { enabled: false } };
const menu = [dish, burger, { ...burger, _id: 'premium-wings', name: 'Grilled Wings', category: 'Grills', image: photo(2), price: 24 }, { ...burger, _id: 'premium-kofta', name: 'Lamb Kofta', category: 'Grills', image: photo(3), price: 36 }];
const combo = { _id: 'premium-sharing', name: 'The sharing grill', description: 'A feast for two.', image: photo(0), comboPrice: 79, price: 79, regularPrice: 84, category: 'Combos', status: 'published', isAvailable: true, items: [{ menuItem: dish, quantity: 2 }] };
const offer = { _id: 'premium-combo-offer', title: 'The sharing grill', subtitle: 'A feast for two', description: '', image: photo(0), isActive: true, isFeatured: true, sortOrder: 0, startDate: new Date(Date.now() - 86400000).toISOString(), expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), promoCode: '', discountType: 'fixed', discountValue: 0, couponScope: 'order', membersOnly: false, minimumTier: 'Bronze', minimumOrderAmount: 0, maximumDiscount: null, usageLimit: null, usageCount: 0, orderProductType: 'combo', orderProduct: { productType: 'combo', quantity: 1, product: combo } };
const coupon = { ...offer, _id: 'premium-coupon', title: 'Save SAR 10', subtitle: 'On orders of SAR 60 or more', image: '', promoCode: 'DUNE10', discountValue: 10, minimumOrderAmount: 60, orderProduct: null };
const items = [dish, burger].map(item => ({ name: item.name, image: item.image, quantity: 1, price: item.price, spiceLevel: '', itemNote: '', selectedAddOns: [] }));
const current = { _id: 'premium-current', orderNumber: 'DG-1042-1', totalAmount: 66, subtotal: 68, deliveryFee: 8, discountAmount: 10, status: 'preparing', paymentStatus: 'pending', fulfillmentType: 'delivery', createdAt: new Date().toISOString(), items };
const past = { ...current, _id: 'premium-past', orderNumber: 'DG-1038-1', status: 'delivered', paymentStatus: 'paid', createdAt: new Date(Date.now() - 86400000 * 2).toISOString() };
const config = { websiteOrderingEnabled: true, minimumDeliveryOrder: 0, paymentOptions: [{ code: 'cod', enabled: true }], orderTypes: [{ value: 'delivery', label: 'Delivery', deliveryFee: 8 }, { value: 'pickup', label: 'Pickup', deliveryFee: 0 }] };
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(user => {
    window.__profileFixture = { session: { token: 'premium-ui-fixture', user, expiresAt: Date.now() + 86400000 } };
  }, user);
  const errors = []; const writes = []; let showActive = false; let distanceBased = false;
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  for (const item of photos) {
    const url = new URL(item.image, 'https://duneandgrills-testing-six.vercel.app/').href;
    const cached = path.join(artifacts, crypto.createHash('sha256').update(url).digest('hex') + '.image');
    await context.route(url, route => fs.existsSync(cached) ? route.fulfill({ contentType: 'image/jpeg', body: fs.readFileSync(cached) }) : route.abort());
  }
  await context.route('**/api/**', async route => {
    const request = route.request(); const key = new URL(request.url()).pathname.replace(/^\/api\//, '');
    const reply = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
    if (request.method() !== 'GET') writes.push(key);
    if (key === 'auth/me') return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ user }) });
    if (key === 'menu') return reply(menu);
    if (key.startsWith('menu/')) return reply(menu.find(item => item._id === key.slice(5)));
    if (key === 'combos') return reply([combo]);
    if (key === 'combos/' + combo._id) return reply(combo);
    if (key === 'offers') return reply([offer, coupon]);
    if (key === 'offers/' + coupon._id) return reply(coupon);
    if (key === 'offers/' + offer._id) return reply(offer);
    if (key === 'offers/validate-coupon') return reply({ originalSubtotal: 68, discountAmount: 10 });
    if (key === 'settings/public') return reply({ receipt: { restaurantName: 'Dune & Grills', phone: '+966500000000' }, location: { city: 'Riyadh' } });
    if (key === 'orders/config') return reply(distanceBased ? { ...config, checkout: { delivery: { enabled: true } } } : config);
    if (key === 'orders/my') return reply(showActive ? [current, past] : [past]);
    if (key.startsWith('orders/')) return reply(key.endsWith(current._id) ? current : past);
    if (key === 'profile/favorites') return reply([]);
    if (key === 'profile/addresses') return reply([{ _id: 'premium-home', label: 'Home', fullAddress: 'Home · Riyadh', phone: user.phone, isDefault: true }]);
    if (key === 'rewards/me') return reply({ pointsBalance: 240, pointsDebt: 0, pointsPerSAR: 1, policy: { earnAfter: 'completed_and_paid', pointsExpire: false }, history: [] });
    return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Unsupported local UI fixture' }) });
  });
  const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true });
  const text = value => page.getByText(value, { exact: true }).filter({ visible: true });
  const tab = name => page.getByRole('tab', { name, exact: true });
  const shot = async name => {
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ' fits viewport');
    await page.screenshot({ path: path.join(artifacts, name + '.png'), animations: 'disabled' });
  };
  try {
    await page.goto(base + '/home'); await text('What are you craving?').waitFor(); await button('Browse Grills').waitFor();
    assert.equal(await page.getByRole('tab').count(), 5);
    await shot('premium-home-390');
    showActive = true;
    await tab('Menu').click(); await text('Explore the menu').waitFor();
    await page.getByRole('textbox', { name: 'Search the menu' }).fill('no matching food'); await text('No dishes match your search.').waitFor();
    await page.getByRole('textbox', { name: 'Search the menu' }).fill('');
    await button('View Mixed Grill').waitFor(); await shot('premium-menu-390');
    const a = await button('View Mixed Grill').boundingBox(); const b = await button('View Chicken Burger').boundingBox();
    assert.ok(Math.abs(a.y - b.y) < 3 && b.x > a.x, 'Menu has two product columns');
    await button('View Mixed Grill').click(); await text('Choose portion size').waitFor();
    assert.equal(await button('Add to cart · SAR 42.00').getAttribute('aria-disabled'), 'true');
    await button('Regular +SAR 0.00').click(); await button('Garlic dip +SAR 0.00').click();
    assert.notEqual(await button('Add to cart · SAR 42.00').getAttribute('aria-disabled'), 'true');
    await page.getByRole('heading', { name: 'Mixed Grill', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }));
    await shot('premium-item-390'); await text('Choose your dip').scrollIntoViewIfNeeded(); await shot('premium-item-options-390');
    await button('Add to cart · SAR 42.00').click(); await text('Your cart').waitFor();
    await tab('Menu').click(); await button('Add Chicken Burger').click(); await button('Open cart, 2 items').click();
    await text('Subtotal').waitFor(); await page.getByRole('textbox', { name: 'Coupon code', exact: true }).fill('DUNE10'); await button('Apply').click();
    await text('Coupon applied. Confirmed again at checkout.').waitFor();
    assert.ok(await text('SAR 66.00').count() >= 1);
    const checkout = await button('Continue to checkout').boundingBox(); assert.ok(checkout.y + checkout.height < 844, 'Checkout is visible in the footer');
    await shot('premium-cart-390'); await text('Order summary').scrollIntoViewIfNeeded(); await shot('premium-cart-summary-390');
    await tab('Offers').click(); await text('Your favourites. Better deals.').waitFor(); await shot('premium-offers-390');
    assert.equal(await tab('Offers').getAttribute('aria-selected'), 'true'); assert.equal(await tab('Home').getAttribute('aria-selected'), 'false');
    await button('Coupons').click(); await text('Save SAR 10').waitFor(); assert.equal(await button('View combo, The sharing grill').count(), 0);
    await shot('premium-coupon-390'); await button('All offers').click();
    await tab('Profile').click(); await text('My profile').waitFor(); await text('240').waitFor(); await shot('premium-profile-390');
    await tab('Orders').click(); await text('CURRENT ORDERS').waitFor(); await text('PAST ORDERS').waitFor(); await shot('premium-orders-390');
    await button('Active orders').click(); assert.equal(await text(past.orderNumber).count(), 0); await button('All orders').click();
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const [name, ready] of [['Home', 'What are you craving?'], ['Menu', 'Explore the menu'], ['Offers', 'Your favourites. Better deals.'], ['Profile', 'My profile'], ['Orders', 'Your orders']]) {
        await tab(name).click(); await text(ready).waitFor(); await shot(`premium-${name.toLowerCase()}-${width}`);
      }
      await tab('Menu').click(); await button('Open cart, 2 items').click(); await text('Your cart').waitFor(); await shot(`premium-cart-${width}`);
      await tab('Menu').click(); await button('View Mixed Grill').click(); await text('Choose portion size').waitFor();
      await text('Quantity').scrollIntoViewIfNeeded();
      const quantity = await button('Increase quantity').boundingBox(); const footer = await button('Add to cart · SAR 42.00').boundingBox();
      assert.ok(quantity.y + quantity.height <= footer.y, 'Item quantity scrolls above purchase footer');
      await shot(`premium-item-${width}`); await page.goBack();
    }
    distanceBased = true;
    const distanceConfig = page.waitForResponse(response => response.url().endsWith('/orders/config'));
    await page.goto(base + '/cart'); await distanceConfig; await text('Order summary').waitFor();
    await page.waitForTimeout(200); assert.equal(await text('At checkout').count(), 2, 'Distance-based delivery does not display the static delivery fee or an unquoted total');
    assert.equal(await button('Continue to checkout').getByText(/SAR/).count(), 0);
    await page.setViewportSize({ width: 320, height: 900 }); await tab('Profile').click(); await button('العربية').click();
    await text('ملفي الشخصي').waitFor().catch(() => text('الملف الشخصي').waitFor()); await shot('premium-profile-ar-320');
    await tab('القائمة').click(); await text('استكشف القائمة').waitFor(); await shot('premium-menu-ar-320');
    await tab('العروض').click(); await shot('premium-offers-ar-320');
    await tab('الطلبات').click(); await shot('premium-orders-ar-320');
    assert.deepEqual(errors, []); assert.deepEqual(writes, ['offers/validate-coupon']);
    console.log('PASS: seven premium screens, five real tabs, two-column/search menu, required item customization, cart arithmetic/coupon, sticky purchase controls, offer filters, account rewards, active/past order filters, 320/390/768px and Arabic RTL. All requests intercepted.');
  } catch (error) {
    await page.screenshot({ path: path.join(artifacts, 'premium-ui-failure.png') }); console.error(await page.locator('body').innerText()); throw error;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
