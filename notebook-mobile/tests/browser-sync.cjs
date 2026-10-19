// Browser integration of the real provider/storage/HTTP client, with an owned
// remote fixture. This never contacts staging or production.
process.env.NOTEBOOK_EXPORT_DIR = 'dist-fixture';
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const server = require('../scripts/preview.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { for (let i = 0; i < 100; i++) { if (check()) return; await delay(100); } throw new Error('Timed out waiting for fixture state.'); }
async function main() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); const errors = []; const records = new Map(); const uploads = []; const seen = [];
  let releaseFirst; const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  let firstReceived = false; let dropNext = false;
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => {
    const url = route.request().url();
    return url.startsWith(base + '/') || url.startsWith('http://notebook.fixture.invalid/') || url.startsWith('data:') ? route.fallback() : route.abort();
  });
  await context.route('http://notebook.fixture.invalid/api/notebook/**', async route => {
    const req = route.request(); const url = new URL(req.url());
    seen.push(req.method() + ' ' + url.pathname);
    const reply = (data, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS' }, body: status === 204 ? '' : JSON.stringify(data) });
    if (req.method() === 'OPTIONS') return reply(null, 204);
    if (url.pathname.endsWith('/login')) {
      const login = req.postDataJSON();
      return reply({ success: true, token: 'owned-fixture-token', expiresAt: Date.now() + 3600000, user: { id: login.email.startsWith('other') ? 'other-staff' : 'staff', name: 'Owned Staff', role: 'inventory' } });
    }
    if (req.headers().authorization !== 'Bearer owned-fixture-token') return reply({ success: false, message: 'Unauthorized' }, 401);
    if (req.method() === 'GET') return reply({ success: true, notes: [...records.values()], next: null });
    const id = url.pathname.split('/').at(-1); const body = req.postDataJSON(); uploads.push({ id, body });
    if (!firstReceived) { firstReceived = true; await firstGate; }
    const old = records.get(id);
    if (old && old.mutationId === body.mutationId) return reply({ success: true, note: old });
    if (old && (old.revision !== body.expectedRevision || old.status === 'entered')) return reply({ success: false, message: 'This note changed on another device. Review both versions.', serverNote: old }, 409);
    const remote = { ...body.note, createdAt: old?.createdAt || body.note.createdAt, enteredBy: body.note.status === 'entered' ? 'Owned Staff' : '', mutationId: body.mutationId, revision: (old?.revision || 0) + 1 };
    records.set(id, remote);
    if (dropNext) { dropNext = false; return route.abort('failed'); }
    return reply({ success: true, note: remote });
  });
  async function tabs() {
    for (let i = 0; i < 5; i++) {
      if (await page.getByRole('tab', { name: 'Settings', exact: true }).isVisible()) return;
      await page.getByRole('button', { name: 'Go back', exact: true }).click();
    }
    throw new Error('Could not return to tab navigation');
  }
  async function settings() { await tabs(); await page.getByRole('tab', { name: 'Settings', exact: true }).click(); }
  async function connect(email = 'staff@fixture.invalid') {
    await page.getByRole('textbox', { name: 'Staff Email', exact: true }).fill(email);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill('OwnedDummy123!');
    await page.getByRole('button', { name: 'Connect Staff Account', exact: true }).click();
  }
  try {
    await page.goto(base);
    await page.getByRole('button', { name: 'New Note', exact: true }).click();
    await page.getByRole('textbox', { name: 'What would you like to note?', exact: true }).fill('Flour purchase');
    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('12');
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    await page.getByRole('heading', { name: 'Note Details', exact: true }).waitFor();
    await settings(); await connect(); await page.getByText('Connected as Owned Staff', { exact: true }).waitFor(); await until(() => firstReceived);
    await page.getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Open note: Flour purchase', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Note', exact: true }).click();
    await page.getByRole('textbox', { name: 'What would you like to note?', exact: true }).fill('Flour purchase revised while syncing');
    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('12.50');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    releaseFirst();
    await until(() => [...records.values()][0]?.text === 'Flour purchase revised while syncing');
    assert.equal(records.size, 1); assert.equal(uploads[1].body.expectedRevision, 1);
    assert.equal([...records.values()][0].amountMinor, 1250);
    await settings(); await page.getByText('All notes synced', { exact: true }).last().waitFor();
    const id = [...records.keys()][0];
    records.set(id, { ...records.get(id), text: 'Different device version', revision: 3, mutationId: randomUUID() });
    await page.getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Open note: Flour purchase revised while syncing', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Note', exact: true }).click();
    await page.getByRole('textbox', { name: 'What would you like to note?', exact: true }).fill('Keep this local correction');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.getByText('Server Version', { exact: true }).last().waitFor();
    await page.getByText('Different device version', { exact: true }).last().waitFor();
    await page.getByRole('button', { name: 'Keep My Version', exact: true }).click();
    await until(() => records.get(id)?.text === 'Keep this local correction' && records.get(id)?.revision === 4);
    await settings(); await page.getByText('All notes synced', { exact: true }).last().waitFor();
    await page.getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'New Note', exact: true }).click();
    await page.getByRole('textbox', { name: 'What would you like to note?', exact: true }).fill('Lost response receipt reminder');
    dropNext = true;
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    await until(() => records.size === 2);
    await page.reload(); await page.getByRole('heading', { name: 'Note Details', exact: true }).waitFor();
    // Browser reload intentionally clears its in-memory session, while the
    // unresolved upload remains durably stored with its original mutation id.
    await settings(); await connect();
    await page.getByText('All notes synced', { exact: true }).last().waitFor();
    const retry = uploads.filter(u => u.id !== id);
    assert.equal(retry.length, 2); assert.equal(retry[0].body.mutationId, retry[1].body.mutationId); assert.deepEqual(retry[0].body, retry[1].body);
    assert.equal(records.size, 2);
    await page.getByRole('tab', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Open note: Lost response receipt reminder', exact: true }).click();
    await page.getByRole('button', { name: 'Mark as Entered', exact: true }).click();
    await until(() => [...records.values()].some(n => n.status === 'entered'));
    await settings(); await page.getByText('All notes synced', { exact: true }).last().waitFor();
    await page.getByRole('button', { name: 'Disconnect Backup', exact: true }).click(); await connect('other@fixture.invalid');
    await page.getByText('This notebook belongs to another account or server. Reconnect with the original staff account.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS: edit during upload, stable revision handoff, visible conflict resolution, lost-response retry across restart, duplicate prevention, completion sync, account binding.');
  } catch (error) { console.error('Fixture requests:', seen, '\nUI:', await page.locator('body').innerText()); throw error; }
  finally { releaseFirst(); await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; server.close(); });

