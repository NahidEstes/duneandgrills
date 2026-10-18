const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const demo = process.argv.includes('--demo');
const root = path.resolve(__dirname, demo ? '../artifacts/demo-dist' : '../dist');
const output = path.resolve(__dirname, process.env.RIDER_SCREENSHOTS_DIR || '../artifacts/screenshots'); fs.mkdirSync(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf' };
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://fixture.local').pathname);
  let file = path.resolve(root, '.' + pathname);
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) file = fs.existsSync(file + '.html') ? file + '.html' : path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const errors = [], external = [];
  let lastPage;
  try {
    for (const width of [320, 390, 820]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin !== base) { external.push(route.request().url()); return route.abort(); }
        return route.continue();
      });
      const page = await context.newPage(); lastPage = page; page.on('pageerror', error => errors.push(error.message));
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(base);
      const shot = async name => { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, `${name} overflows at ${width}`); await page.screenshot({ path: path.join(output, `${demo ? '' : 'native-gate-'}${name}-${width}.png`) }); };
      if (!demo) {
        await page.getByText('Rider sign in', { exact: true }).waitFor();
        await page.getByText('Staff sign in requires the native Android or iOS app.', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).isDisabled(), true);
        await page.getByLabel('Email', { exact: true }).fill('owned-fixture@rider.invalid');
        await page.getByLabel('Password', { exact: true }).fill('LocalDummy123!');
        await page.getByLabel('Password', { exact: true }).press('Enter');
        await shot('sign-in');
      } else {
        await page.getByText('Hello, Ahmed', { exact: true }).waitFor(); await shot('home');
        const available = page.getByRole('switch', { name: 'Available for deliveries' }); assert.equal(await available.isDisabled(), true);
        await page.getByRole('button', { name: 'View delivery →', exact: true }).first().click();
        await page.getByText('Delivery Details', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Confirm Pickup', exact: true }).isDisabled(), true); await shot('pickup');
        await page.getByRole('tab', { name: /Deliveries/ }).click();
        // A nested delivery stack may keep its detail; navigate to its root explicitly.
        await page.goto(base + '/deliveries'); await page.getByText('My deliveries', { exact: true }).waitFor(); await shot('deliveries');
        await page.getByRole('button', { name: 'Completed', exact: true }).click();
        await page.getByRole('button', { name: 'Hide search / filters', exact: true }).waitFor();
        assert.equal(await page.getByText('Omar A.', { exact: true }).count(), 0);
        await shot('history');
        await page.getByRole('button', { name: 'Delivered date · Riyadh: All dates', exact: true }).click();
        await page.getByRole('button', { name: 'Today', exact: true }).click();
        await page.getByRole('button', { name: 'Close options', exact: true }).waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Delivered date · Riyadh: Today', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Cash status: All cash states', exact: true }).click();
        await page.getByRole('button', { name: 'Awaiting cashier', exact: true }).click();
        await page.getByRole('button', { name: 'Close options', exact: true }).waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Search / Apply', exact: true }).click();
        await page.getByText('DG-1045', { exact: true }).waitFor();
        assert.equal(await page.getByText('DG-1047', { exact: true }).count(), 0);
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await page.getByText('DG-1047', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'View delivery →', exact: true }).first().click();
        await page.getByText('Delivery completed', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Call Customer', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Open Map', exact: true }).count(), 0); await shot('completed');
        await page.getByRole('tab', { name: /Cash/ }).click();
        await page.getByText('Cash overview', { exact: true }).waitFor(); await shot('cash');
        await page.getByRole('button', { name: 'Awaiting cashier', exact: false }).first().click();
        await page.getByText('My deliveries', { exact: true }).last().waitFor();
        await page.getByText('DG-1045', { exact: true }).last().waitFor();
        await page.getByRole('tab', { name: /Profile/ }).click();
        await page.getByText('My profile', { exact: true }).waitFor(); await shot('profile');
        assert.equal(await page.getByRole('button', { name: 'Sign out', exact: true }).isDisabled(), true);
        await page.goto(base + '/deliveries/demo-issue');
        await page.getByText('Delivery Issue · Awaiting manager review', { exact: true }).waitFor(); await shot('issue');
        await page.goto(base + '/deliveries/demo-transit');
        await page.getByText('Picked up · Out for delivery', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Confirm Delivery', exact: true }).isDisabled(), true); await shot('out-for-delivery');
      }
      await context.close();
    }
    assert.deepEqual(errors, []); assert.deepEqual(external, []);
    console.log(`PASS: ${demo ? 'read-only nine-screen workflow' : 'native authentication gate'} at 320/390/820px; no external requests, page errors or horizontal overflow.`);
  } catch (error) {
    if (lastPage && !lastPage.isClosed()) { await lastPage.screenshot({ path: path.join(output, 'failure.png') }); console.error((await lastPage.locator('body').innerText()).slice(0, 3000), errors); }
    throw error;
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
