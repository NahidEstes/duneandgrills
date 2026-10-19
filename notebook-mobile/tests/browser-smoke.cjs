const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const server = require('../scripts/preview.cjs');
const artifacts = path.resolve(__dirname, '../artifacts');
async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => {
    const url = route.request().url();
    return url.startsWith(base + '/') || url.startsWith('data:') ? route.fallback() : route.abort();
  });
  try {
    await page.goto(base);
    await page.getByText('Expense Notebook', { exact: true }).waitFor();
    await page.getByText('Your notebook starts here', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'New Note', exact: true }).click();
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    await page.getByText('Write a note before saving.', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'What would you like to note?', exact: true }).fill('Bought 10 kg of chicken for SAR 230. Paid in cash.');
    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('230');
    await page.getByRole('button', { name: 'Purchase', exact: true }).click();
    await page.getByRole('button', { name: 'Cash', exact: true }).click();
    const receipt = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 500;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 360, 500);
      ctx.fillStyle = '#111'; ctx.font = '24px sans-serif'; ctx.fillText('OWNED TEST RECEIPT', 24, 55);
      ctx.font = '18px sans-serif'; ctx.fillText('Chicken 10 kg', 24, 110); ctx.fillText('Total SAR 230.00', 24, 150);
      return canvas.toDataURL('image/jpeg').split(',')[1];
    });
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Choose Photo', exact: true }).click();
    await (await chooser).setFiles({ name: 'owned-receipt.jpg', mimeType: 'image/jpeg', buffer: Buffer.from(receipt, 'base64') });
    await page.getByText('Receipt attached', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'New Note', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, '02-new-note.png'), fullPage: true });
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    await page.getByRole('heading', { name: 'Note Details', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Open full receipt', exact: true }).click();
    await page.getByRole('button', { name: 'Close receipt', exact: true }).click();
    await page.reload();
    await page.getByRole('heading', { name: 'Note Details', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Open full receipt', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Edit Note', exact: true }).click();
    await page.getByRole('textbox', { name: 'What would you like to note?', exact: true }).fill('Chicken 10 kg, checked receipt. Paid cash.');
    await page.getByRole('button', { name: 'Save Changes', exact: true }).click();
    await page.getByRole('heading', { name: 'Note Details', exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, '03-note-details.png'), fullPage: true });
    await page.getByRole('button', { name: 'Mark as Entered', exact: true }).click();
    await page.getByText(/Marked as entered by This device/).last().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Mark as Entered', exact: true }).count(), 0);
    await page.goto(base);
    await page.getByRole('button', { name: 'New Note', exact: true }).click();
    await page.getByRole('textbox', { name: 'What would you like to note?', exact: true }).fill('Vegetables for kitchen');
    await page.getByRole('textbox', { name: 'Amount', exact: true }).fill('85');
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    await page.getByRole('heading', { name: 'Note Details', exact: true }).waitFor();
    await page.goto(base);
    await page.getByText('315.00 SAR', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(artifacts, '01-home.png'), fullPage: true });
    await page.getByText('View All', { exact: true }).click();
    await page.getByRole('textbox', { name: 'Search notes', exact: true }).fill('chicken');
    await page.getByText('1 note', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Pending', exact: true }).click();
    await page.getByText('No notes found', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Entered', exact: true }).click();
    await page.getByText('1 note', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'More filters', exact: true }).click();
    await page.getByRole('textbox', { name: 'From Date', exact: true }).fill('2026-02-30');
    await page.getByRole('button', { name: 'Apply Dates', exact: true }).click();
    await page.getByText('Enter a valid date range using YYYY-MM-DD.', { exact: true }).waitFor();
    await page.goto(base + '/new');
    await page.getByRole('textbox', { name: 'What would you like to note?', exact: true }).fill('Unsaved temporary note');
    await page.getByRole('button', { name: 'Go back', exact: true }).click();
    await page.getByText('You have an unsaved note. Save it below or discard these changes.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Discard Changes', exact: true }).click();
    await page.goto(base);
    await page.getByText('315.00 SAR', { exact: true }).waitFor();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'New Note', exact: true }).click();
    await page.getByRole('textbox', { name: 'What would you like to note?', exact: true }).fill('Offline reminder without an amount');
    await page.getByRole('button', { name: 'Save Note', exact: true }).click();
    await page.getByRole('heading', { name: 'Note Details', exact: true }).waitFor();
    await context.setOffline(false); await page.reload();
    await page.getByText('Offline reminder without an amount', { exact: true }).first().waitFor();
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 }); await page.goto(base);
      await page.getByText('Expense Notebook', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'Horizontal overflow at ' + width);
      assert.equal(/[\u0980-\u09ff]/.test(await page.locator('body').innerText()), false, 'Non-English UI text');
      await page.screenshot({ path: path.join(artifacts, 'home-' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: create, validation, receipt upload/preview/reload, edit, completion, totals, search/status/date filters, discard guard, offline save, 320/390/768px layouts, English UI.');
  } finally { await context.close(); await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; server.close(); });


