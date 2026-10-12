const { test } = require('node:test'); const assert = require('node:assert/strict');
const { repeatPlan } = require('../.test-build/domain/repeat'); const { lineFor, emptySelection } = require('../.test-build/domain/cart');
const { publicLink, publicIntent, shareContent } = require('../.test-build/domain/public-links');
const { redirectSystemPath } = require('../.test-build/app/+native-intent');
const product = { _id: 'fixture-food', productType: 'menuItem', name: 'Fixture food', price: 25, isAvailable: true, addOns: [{ _id: 'cheese', name: 'Cheese', price: 4 }], customization: { enabled: true, spice: { enabled: true, options: ['mild', 'hot'], default: 'mild' }, groups: [] } };
const row = { _id: product._id, productType: 'menuItem', name: product.name, quantity: 2, price: 20, selectedAddOns: [{ _id: 'cheese', quantity: 1 }], spiceLevel: 'mild', note: 'Private historical note' };
test('reorder uses current catalog/customization, strips old notes and reports changed prices/skips', () => {
  const plan = repeatPlan([row, { ...row, _id: 'missing' }, { ...row, spiceLevel: 'retired-spice' }], [product], [], false, ['A sold-out historical item was skipped.']);
  assert.equal(plan.added, 2); assert.equal(plan.lines[0].unitPrice, 29); assert.equal(plan.lines[0].selection.note, ''); assert.equal(plan.lines[0].selection.spiceLevel, 'mild');
  assert.equal(plan.warnings.length, 4); assert.match(plan.warnings.join(' '), /29.00/);
});
test('merge keeps existing cart; replacement uses only eligible lines; no eligible lines never clear it', () => {
  const cart = [lineFor(product, emptySelection(), 1)];
  assert.equal(repeatPlan([row], [product], cart, false).lines.length, 2);
  assert.equal(repeatPlan([row], [product], cart, true).lines.length, 1);
  assert.equal(repeatPlan([{ ...row, _id: 'gone' }], [product], cart, true).lines, cart);
});
test('reorder merge and replacement enforce 99 quantities and 100 selections without partial destructive writes', () => {
  const selection = { selectedAddOns: row.selectedAddOns.map(a => ({ id: a._id, quantity: a.quantity })), spiceLevel: row.spiceLevel, note: '' };
  const cart = [lineFor(product, selection, 98)]; const plan = repeatPlan([row], [product], cart, false);
  assert.equal(plan.lines, cart); assert.equal(plan.added, 0); assert.match(plan.warnings.join(' '), /99/);
  assert.equal(repeatPlan([{ ...row, quantity: 100 }], [product], cart, true).lines, cart);
  const full = Array.from({ length: 100 }, (_, i) => lineFor({ ...product, _id: 'food-' + i }, emptySelection(), 1));
  assert.equal(repeatPlan([row], [product], full, false).added, 0);
});
test('public shares contain only public content and canonical HTTPS paths, without offer discount claims', () => {
  assert.equal(publicLink('https://website.fixture.test', 'item', 'fixture-food'), 'https://website.fixture.test/item/fixture-food');
  const content = shareContent('https://website.fixture.test', 'offer', 'fixture-offer', 'Weekend meal', 'Unverified 90% off');
  assert.deepEqual(content, { title: 'Weekend meal', message: 'Weekend meal\nhttps://website.fixture.test/offer/fixture-offer' });
  for (const base of ['http://website.fixture.test', 'https://secret:token@website.fixture.test', 'https://website.fixture.test/api', 'https://website.fixture.test?token=secret']) assert.throws(() => publicLink(base, 'item', 'fixture-food'));
  for (const id of ['', '../orders', 'a?token=secret', 'a/b', '%2f', 'x'.repeat(121)]) assert.throws(() => publicLink('https://website.fixture.test', 'item', id));
});
test('cold/warm link resolver accepts only canonical website item paths and safely handles malformed input', () => {
  const base = 'https://website.fixture.test';
  for (const kind of ['item', 'combo', 'offer']) assert.equal(publicIntent(`${base}/${kind}/fixture-id?ignored=1`, base), `/${kind}/fixture-id`);
  assert.equal(publicIntent('duneandgrills://item/fixture-id', base), '/item/fixture-id');
  assert.equal(publicIntent('/checkout', base), '/checkout');
  for (const url of ['https://evil.fixture.test/item/id', `${base}/order/private`, `${base}/item/%2F`, 'javascript:evil', '//evil.fixture.test', `${base}/combo/`, 'https://[invalid']) assert.equal(publicIntent(url, base), '/link-unavailable');
});

test('the actual Expo native-intent entry handles both cold and warm canonical links', () => {
  const saved = process.env.EXPO_PUBLIC_WEBSITE_URL;
  try {
    process.env.EXPO_PUBLIC_WEBSITE_URL = 'https://website.fixture.test';
    for (const initial of [true, false]) for (const kind of ['item', 'combo', 'offer']) {
      assert.equal(redirectSystemPath({ initial, path: `https://website.fixture.test/${kind}/fixture-id` }), `/${kind}/fixture-id`);
      assert.equal(redirectSystemPath({ initial, path: `https://website.fixture.test/${kind}/%2F` }), '/link-unavailable');
    }
  } finally { if (saved === undefined) delete process.env.EXPO_PUBLIC_WEBSITE_URL; else process.env.EXPO_PUBLIC_WEBSITE_URL = saved; }
});
