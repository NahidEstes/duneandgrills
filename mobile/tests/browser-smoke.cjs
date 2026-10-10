// A local diagnostic web render of native React Native screens. API requests
// are intercepted fixtures; no staging order/account writes are permitted.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http'); const fs = require('node:fs'); const path = require('node:path');
const root = path.resolve(__dirname, '../dist'); const artifacts = path.resolve(__dirname, '../artifacts');
const addon = { _id: 'sauce', name: 'Garlic sauce', price: 2 };
const dish = { _id: 'grill', name: 'Chicken Grill', description: 'Fresh grilled chicken with rice', image: '', price: 20, category: 'Grills', isAvailable: true, addOns: [addon], customization: { enabled: true, spice: { enabled: true, options: ['mild', 'hot'], default: 'mild' }, groups: [{ name: 'Choose sauce', selectionType: 'single', minSelections: 1, maxSelections: 1, addOns: [addon] }] } };
const config = { websiteOrderingEnabled: true, minimumDeliveryOrder: 30, paymentOptions: [{ code: 'cod', enabled: true }], orderTypes: [{ value: 'delivery', label: 'Delivery', deliveryFee: 10 }, { value: 'pickup', label: 'Pickup', deliveryFee: 0 }] };
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://local').pathname));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); const errors = []; const mutations = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/api/**', async route => {
    const req = route.request(); const pathname = new URL(req.url()).pathname.replace(/^\/api/, '');
    if (req.method() !== 'GET') mutations.push(pathname);
    let data;
    if (pathname === '/menu') data = [dish, { ...dish, _id: 'drink', name: 'Fresh Lemon', category: 'Drinks', customization: { enabled: false }, addOns: [] }];
    else if (pathname === '/combos') data = [];
    else if (pathname === '/menu/grill') data = dish;
    else if (pathname === '/orders/config') data = config;
    else if (pathname === '/offers/validate-coupon') data = { code: 'SAVE', originalSubtotal: 44, discountedSubtotal: 40, discountAmount: 4 };
    else { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'Diagnostic fixture does not support this request' }) }); return; }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
  });
  try {
    await page.goto(base); await page.getByRole('button', { name: 'View Chicken Grill' }).waitFor();
    await page.getByRole('textbox', { name: 'Search the menu' }).fill('no match'); await page.getByText('No dishes match your search.').waitFor();
    await page.getByRole('textbox', { name: 'Search the menu' }).fill('');
    await page.screenshot({ path: path.join(artifacts, 'menu-390.png'), fullPage: true });
    await page.getByRole('button', { name: 'View Chicken Grill' }).click(); await page.getByText('Choose sauce', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: /Add to cart/ }).getAttribute('aria-disabled'), 'true');
    await page.getByRole('button', { name: /Garlic sauce/ }).click(); await page.getByRole('button', { name: '+', exact: true }).click();
    await page.getByRole('textbox', { name: /Item note/ }).fill('No onion'); await page.screenshot({ path: path.join(artifacts, 'item-390.png'), fullPage: true });
    await page.getByRole('button', { name: /Add to cart/ }).click(); await page.getByText('Subtotal', { exact: true }).waitFor();
    await page.reload(); await page.getByText('SAR 22.00 each · SAR 44.00').waitFor();
    await page.getByRole('button', { name: 'Continue to checkout' }).click(); await page.getByRole('textbox', { name: 'Customer name' }).waitFor();
    await page.getByRole('button', { name: 'Review order', exact: true }).click(); await page.getByText('Enter a name of 1–100 characters').waitFor();
    await page.getByRole('textbox', { name: 'Customer name' }).fill('Owned UI fixture'); await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+966500000000');
    await page.getByRole('textbox', { name: 'Delivery address' }).fill('Owned test address'); await page.getByRole('textbox', { name: 'Coupon code (optional)' }).fill('SAVE');
    await page.getByRole('button', { name: 'Review order', exact: true }).click(); await page.getByRole('button', { name: 'Place cash order · SAR 50.00' }).waitFor();
    await page.screenshot({ path: path.join(artifacts, 'checkout-390.png'), fullPage: true });
    await page.getByRole('button', { name: 'Place cash order · SAR 50.00' }).click(); await page.getByText(/Secure checkout and login require the native/).waitFor();
    assert.equal(mutations.includes('/orders'), false, 'web must never send an order without protected persistence');
    await page.goto(base + '/auth'); await page.getByRole('button', { name: 'Sign in', exact: true }).last().click(); await page.getByText('Enter a valid email', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Register', exact: true }).click(); await page.getByText('At least 10 characters: uppercase, lowercase, number and symbol.').waitFor();
    await page.screenshot({ path: path.join(artifacts, 'auth-390.png'), fullPage: true });
    await page.setViewportSize({ width: 768, height: 1024 }); await page.goto(base); await page.getByRole('button', { name: 'View Chicken Grill' }).waitFor(); await page.screenshot({ path: path.join(artifacts, 'menu-768.png'), fullPage: true });
    assert.deepEqual(errors, []); assert.deepEqual(mutations, ['/offers/validate-coupon']);
    console.log('PASS: local fixture web UI at 390px and 768px; menu/search/customization/cart restart/checkout validation/coupon/native storage gate/auth validation; no page errors or remote writes.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
