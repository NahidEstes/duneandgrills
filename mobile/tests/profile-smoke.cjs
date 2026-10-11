// Authenticated browser diagnostics use profile-harness.cjs's isolated copy.
// All requests are intercepted; production SecureStore and API data are untouched.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict'); const fs = require('node:fs'); const path = require('node:path'); const http = require('node:http');
const artifacts = path.resolve(__dirname, '../artifacts'); const root = path.join(artifacts, 'profile-harness-dist');
const snapshot = JSON.parse(fs.readFileSync(path.join(artifacts, 'catalog-snapshot.json'), 'utf8'));
const originalUser = { _id: 'profile-fixture', name: 'Amina Customer', email: 'amina@example.test', phone: '+966501234567', role: 'customer', avatar: '/fixture-missing-avatar.png' };
const order = { _id: 'fixture-order', orderNumber: 'PROFILE-TEST-1', totalAmount: 33, subtotal: 33, deliveryFee: 0, discountAmount: 0, status: 'Completed', paymentStatus: 'Paid', fulfillmentType: 'pickup', createdAt: new Date().toISOString(), items: [] };
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
  const page = await context.newPage(); const errors = []; const mutations = []; let user = { ...originalUser }; let failure = ''; let missingContact = false; let expireAddressRead = false;
  let addresses = [{ _id: 'home', label: 'Home', fullAddress: 'Fixture home street, Riyadh', phone: user.phone, isDefault: true }, { _id: 'work', label: 'Work', fullAddress: 'Fixture office street, Riyadh', phone: '', isDefault: false }];
  page.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(({ originalUser, order }) => {
    const scenario = new URL(location.href).searchParams.get('fixture');
    const token = 'isolated-profile-test-token';
    const fixture = { tracking: [{ orderNumber: order.orderNumber, token: 'isolated-guest-tracking', actor: 'guest', order }] };
    if (scenario === 'signed' || scenario === 'pending' || scenario === 'long') fixture.session = { token, user: scenario === 'long' ? { ...originalUser, name: 'A customer with a very long profile name and surname', phone: '' } : originalUser, expiresAt: Date.now() + 86400000 };
    if (scenario === 'pending') fixture.pending = { version: 1, actor: originalUser._id, token, baseUrl: 'https://duneandgrills-testing-six.vercel.app/api', createdAt: new Date().toISOString(), payload: { idempotencyKey: 'isolated-fixture-pending', fulfillmentType: 'pickup', paymentOption: 'cod', customer: { name: originalUser.name, email: originalUser.email, phone: originalUser.phone, address: '' }, items: [], kitchenNotes: '', couponCode: '' } };
    window.__profileFixture = fixture;
  }, { originalUser, order });
  await context.route('**/fixture-missing-avatar.png', route => route.fulfill({ status: 404, body: '' }));
  await context.route('**/api/**', async route => {
    const req = route.request(); const key = new URL(req.url()).pathname.replace(/^\/api\//, ''); const method = req.method();
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (method !== 'GET') mutations.push({ key, method, body: req.postDataJSON() });
    if (failure === key && method !== 'GET') { failure = ''; return reply({ message: 'Fixture service unavailable' }, 503); }
    if (key.startsWith('auth/mobile/')) return reply({ token: 'isolated-profile-test-token', user, expiresAt: Date.now() + 86400000 });
    if (key === 'auth/me') {
      if (method === 'PATCH') {
        const body = req.postDataJSON(); if (body.email === 'duplicate@example.test') return reply({ message: 'That email is already in use' }, 409);
        user = { ...user, ...body };
      }
      return reply({ user });
    }
    if (key === 'profile/addresses') {
      if (method === 'GET' && expireAddressRead) { expireAddressRead = false; return reply({ message: 'Expired fixture credential' }, 401); }
      if (method === 'POST') {
        const body = req.postDataJSON(); if (body.isDefault) addresses = addresses.map(a => ({ ...a, isDefault: false }));
        addresses.push({ _id: 'new-address', ...body });
      }
      return reply({ data: addresses });
    }
    if (key.startsWith('profile/addresses/')) {
      const id = key.split('/')[2]; assert.ok(addresses.some(a => a._id === id));
      if (key.endsWith('/default')) addresses = addresses.map(a => ({ ...a, isDefault: a._id === id }));
      else if (method === 'DELETE') addresses = addresses.filter(a => a._id !== id);
      else if (method === 'PATCH') addresses = addresses.map(a => a._id === id ? { ...a, ...req.postDataJSON() } : a);
      return reply({ data: addresses });
    }
    if (key === 'orders/my') return reply({ data: [order] });
    if (key === 'orders/fixture-order' || key === 'orders/track/' + order.orderNumber) return reply({ data: order });
    if (key === 'orders/fixture-order/repeat') return reply({ data: [], warnings: ['Fixture has no items to reorder.'] });
    if (key === 'settings/public') return reply({ data: missingContact ? { receipt: { restaurantName: 'Dune & Grills' }, location: {} } : snapshot[key] });
    if (snapshot[key] !== undefined) return reply({ data: snapshot[key] });
    return reply({ message: 'Diagnostic data unavailable' }, 503);
  });
  const button = name => page.getByRole('button', { name, exact: true }).filter({ visible: true });
  const text = name => page.getByText(name, { exact: true }).filter({ visible: true });
  const fits = async label => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label} fits horizontally`);
  const shot = async name => { await page.waitForTimeout(200); await fits(name); await page.screenshot({ path: path.join(artifacts, `${name}.png`), fullPage: true, animations: 'disabled' }); };
  try {
    await page.goto(base + '/profile'); await button('Create customer account').waitFor(); assert.equal(await button('Log out').count(), 0); assert.equal(await button('Personal information').count(), 0); await shot('profile-guest-390');
    await button('My orders').click(); await text(order.orderNumber).waitFor(); await text(order.orderNumber).click(); await text('Latest restaurant status').waitFor(); assert.equal(await button('Reorder at current prices').count(), 0);
    await page.goto(base + '/profile'); await button('Create customer account').click(); await text('Join the table').waitFor();
    await page.goto(base + '/profile'); await button('Sign in').click(); await page.getByRole('textbox', { name: 'Email', exact: true }).fill(user.email); await page.getByRole('textbox', { name: 'Password', exact: true }).fill('FixturePassword1!'); await button('Sign in').last().click();
    await button('Edit profile').waitFor(); await text('AC').waitFor(); await text(user.name).waitFor(); await text('My profile').scrollIntoViewIfNeeded(); await shot('profile-signed-in-390');
    await button('Log out').scrollIntoViewIfNeeded(); await shot('profile-help-390');
    assert.equal(await button('Privacy & terms').count(), 0); await text('Policy content is not available yet.').waitFor();
    await button('Contact restaurant').click(); assert.equal(await page.evaluate(() => window.__profileContactUrls[0]), 'tel:' + snapshot['settings/public'].location.phone.replace(/[\s()-]/g, ''));
    await page.evaluate(() => { window.__profileContactFailure = true; }); await button('Contact restaurant').click(); await text('Unable to open the contact app. Restaurant contact: ' + snapshot['settings/public'].location.phone).waitFor();
    await button('Edit profile').click(); const name = page.getByRole('textbox', { name: 'Name', exact: true }); const email = page.getByRole('textbox', { name: 'Email', exact: true });
    await name.fill(''); await button('Save profile').click(); await text('Enter your name (1–100 characters).').waitFor();
    await name.fill('Amina Updated'); await email.fill('duplicate@example.test'); await button('Save profile').click(); await text('That email is already in use. Choose another email.').waitFor(); assert.equal(await name.inputValue(), 'Amina Updated');
    await email.fill('updated@example.test'); failure = 'auth/me'; await button('Save profile').click(); await text('The restaurant service is temporarily unavailable. Please try again shortly.').waitFor(); assert.equal(await email.inputValue(), 'updated@example.test'); await shot('profile-edit-error-390');
    await button('Save profile').click(); await text('Profile updated.').waitFor(); await button('Done').click(); await text('Amina Updated').waitFor(); await text('AU').waitFor();
    await button('Personal information').click(); assert.equal(await name.inputValue(), 'Amina Updated'); await page.goBack(); await button('Edit profile').waitFor();
    await button('Saved addresses').first().click(); await text('Fixture home street, Riyadh').waitFor(); await shot('profile-addresses-390');
    await button('Set Work as default').click(); await text('Default address updated.').waitFor(); assert.equal(await button('Set Work as default').count(), 0);
    await button('Edit Work address').click(); await page.getByRole('textbox', { name: 'Full address', exact: true }).fill('Updated fixture office address'); failure = 'profile/addresses/work'; await button('Save address').click(); await text('The restaurant service is temporarily unavailable. Please try again shortly.').waitFor(); assert.equal(await page.getByRole('textbox', { name: 'Full address', exact: true }).inputValue(), 'Updated fixture office address');
    await button('Save address').click(); await text('Updated fixture office address').waitFor();
    await button('Add address').click(); await page.getByRole('textbox', { name: 'Label', exact: true }).fill('Other'); await page.getByRole('textbox', { name: 'Full address', exact: true }).fill('New fixture delivery address'); await button('Save address').click(); await text('New fixture delivery address').waitFor();
    const beforeDelete = mutations.filter(m => m.method === 'DELETE').length;
    await button('Delete Other address').click(); await text('Delete address?').waitFor(); await shot('profile-delete-confirmation-390'); await button('Cancel').click(); assert.equal(mutations.filter(m => m.method === 'DELETE').length, beforeDelete);
    await button('Delete Other address').click(); failure = 'profile/addresses/new-address'; await button('Delete address').click(); await text('The restaurant service is temporarily unavailable. Please try again shortly.').last().waitFor(); await button('Delete address').click(); await text('Address deleted.').waitFor(); assert.equal(await text('New fixture delivery address').count(), 0);
    // The checkout selector reads the same updated collection.
    await page.goto(base + '/address-select?fixture=signed'); await text('Updated fixture office address').first().waitFor(); assert.equal(await page.getByRole('textbox', { name: 'Delivery address', exact: true }).inputValue(), 'Updated fixture office address');
    await page.goto(base + '/profile?fixture=signed'); await button('My orders').click(); await text(order.orderNumber).waitFor(); await text(order.orderNumber).click(); await button('Reorder at current prices').waitFor(); await button('Reorder at current prices').click(); await text('Some items were skipped:\nFixture has no items to reorder.').waitFor();
    await page.goto(base + '/profile?fixture=signed'); await button('Log out').click(); await button('Create customer account').waitFor(); assert.equal(await text(user.name).count(), 0); assert.equal(await button('Saved addresses').count(), 0);
    const retained = await page.evaluate(async () => ({ session: await window.__profileTestVault.read('session'), tracking: await window.__profileTestVault.read('tracking'), owner: localStorage.getItem('dg.cart.owner.v1'), oldCart: localStorage.getItem('dg.cart.v1.profile-fixture') }));
    assert.equal(retained.session, null); assert.ok(retained.tracking.every(t => t.actor === 'guest')); assert.equal(retained.owner, 'guest'); assert.equal(retained.oldCart, null);
    await page.goto(base + '/profile?fixture=pending'); await button('Log out').waitFor(); assert.ok(await button('Log out').isDisabled()); await button('Resolve saved order').waitFor();
    await page.goto(base + '/profile?fixture=signed'); await button('Edit profile').waitFor(); await button('Validate saved session').waitFor({ state: 'hidden' });
    expireAddressRead = true; await button('Saved addresses').first().click(); await text('Sign in to manage saved addresses.').waitFor(); assert.equal(await text('Updated fixture office address').count(), 0);
    await page.goto(base + '/profile'); await button('Create customer account').waitFor(); assert.equal(await text(user.name).count(), 0); await button('Clear cart and continue as guest').click(); await button('Create customer account').waitFor();
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 }); await page.goto(base + '/profile?fixture=signed'); await button('Edit profile').waitFor(); await shot(`profile-signed-in-${width}`); await button('Log out').scrollIntoViewIfNeeded();
      const logout = await button('Log out').boundingBox(); assert.ok(logout.y + logout.height < 844 - 72, 'Logout can scroll fully above bottom tabs'); await shot(`profile-help-${width}`);
    }
    user = { ...user, name: 'A customer with a very long profile name and surname', phone: '' };
    await page.setViewportSize({ width: 320, height: 740 }); await page.goto(base + '/profile?fixture=long'); await text(user.name).waitFor(); await text('Add phone number').waitFor();
    await page.evaluate(() => {
      const values = [...document.querySelectorAll('div[dir="auto"], input, textarea')].map(node => { const style = getComputedStyle(node); const size = parseFloat(style.fontSize); return { node, size: size * 1.3, line: (parseFloat(style.lineHeight) || size * 1.2) * 1.3 }; });
      for (const { node, size, line } of values) { node.style.fontSize = `${size}px`; node.style.lineHeight = `${line}px`; }
    }); await shot('profile-long-name-large-text-320'); await button('Log out').scrollIntoViewIfNeeded(); await shot('profile-help-large-text-320');
    missingContact = true; await page.goto(base + '/profile'); await text('Contact details are not available yet.').waitFor(); assert.equal(await button('Contact restaurant').count(), 0);
    assert.deepEqual(errors, []); console.log('PASS: actual UI/provider login, guest tracking, profile validation/save/error retention, avatar fallback, address add/edit/default/delete confirmation/cancel/retry, shared checkout source, orders/reorder, logout cleanup, pending logout guard, contact URL/adapter failure/missing contact/policy, 320/390/430 layouts and 130% web text. All API writes intercepted; native storage/dialer adapters substituted only in temporary copy.');
  } catch (error) { await page.screenshot({ path: path.join(artifacts, 'profile-diagnostic-failure.png') }); console.error('Visible diagnostic screen:', await page.locator('body').innerText()); throw error; }
  finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
