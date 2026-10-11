// Read-only public catalog used by design-smoke.cjs. No accounts/orders change.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function main() {
  const base = process.env.EXPO_PUBLIC_API_URL || 'https://duneandgrills-testing-six.vercel.app/api';
  const snapshot = {};
  for (const route of ['menu', 'combos', 'settings/public', 'orders/config']) {
    const response = await fetch(`${base}/${route}`);
    if (!response.ok) throw new Error(`${route}: ${response.status}`);
    snapshot[route] = (await response.json()).data;
  }
  const directory = path.resolve(__dirname, '../artifacts');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'catalog-snapshot.json'), JSON.stringify(snapshot, null, 2));
  for (const product of [...snapshot.menu, ...snapshot.combos]) {
    if (!product.image) continue;
    const url = new URL(product.image, base.replace(/\/api\/?$/, '/')).href;
    const photo = await fetch(url);
    if (!photo.ok) throw new Error(`Catalog photo GET failed: ${photo.status}`);
    const file = crypto.createHash('sha256').update(url).digest('hex') + '.image';
    fs.writeFileSync(path.join(directory, file), Buffer.from(await photo.arrayBuffer()));
  }
  console.log(`Captured ${snapshot.menu.length} menu items and ${snapshot.combos.length} combos using public GET requests.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
