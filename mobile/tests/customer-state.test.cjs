const { test } = require('node:test'); const assert = require('node:assert/strict');
const { restoredActor, cartKey, OWNER_KEY } = require('../.test-build/domain/customer-state');
const { expireCredential, storeCustomer, forgetCustomer } = require('../.test-build/services/customer-storage');
function fixture() {
  const protectedData = new Map(); const plain = new Map();
  const vault = { read: async k => protectedData.get(k) || null, write: async (k, v) => protectedData.set(k, structuredClone(v)), remove: async k => protectedData.delete(k) };
  const carts = { getItem: async k => plain.get(k) || null, setItem: async (k, v) => plain.set(k, v), removeItem: async k => plain.delete(k) };
  return { vault, carts, protectedData, plain };
}
const session = id => ({ token: 'protected-token-' + id, expiresAt: 123, user: { _id: id, role: 'customer', name: id, email: id + '@fixture.test', phone: '' } });
const tracking = [{ actor: 'guest', token: 'guest-private' }, { actor: 'a', token: 'account-private' }];
test('expiry preserves original owner and cart through restart without guest conversion or plain tokens', async () => {
  const f = fixture(); await f.vault.write('session', session('a')); await f.carts.setItem(cartKey('a'), '[{"quantity":1}]');
  await expireCredential(f.vault, f.carts, 'a');
  assert.equal(restoredActor(null, await f.vault.read('session'), await f.carts.getItem(OWNER_KEY)), 'a');
  assert.equal(await f.carts.getItem(cartKey('a')), '[{"quantity":1}]');
  assert.equal(JSON.stringify([...f.plain]).includes('protected-token'), false);
});
test('switch clears both account carts and account tracking; same-account reauthentication preserves work', async () => {
  const f = fixture(); await f.carts.setItem(cartKey('a'), 'old'); await f.carts.setItem(cartKey('b'), 'stale');
  const changed = await storeCustomer(f.vault, f.carts, 'a', session('b'), tracking);
  assert.equal(changed.changed, true); assert.deepEqual(changed.tracking, [tracking[0]]);
  assert.equal(await f.carts.getItem(cartKey('a')), null); assert.equal(await f.carts.getItem(cartKey('b')), null);
  assert.equal((await f.vault.read('session')).user._id, 'b');
  await f.carts.setItem(cartKey('b'), 'retained'); await f.vault.write('pending', { actor: 'b', payload: { idempotencyKey: 'fixed' } });
  await storeCustomer(f.vault, f.carts, 'b', session('b'), changed.tracking);
  assert.equal(await f.carts.getItem(cartKey('b')), 'retained'); assert.equal((await f.vault.read('pending')).payload.idempotencyKey, 'fixed');
});
test('guest/account unresolved attempts prevent logout and switching, including across restart', async () => {
  for (const actor of ['guest', 'a']) {
    const f = fixture(); await f.vault.write('pending', { actor, payload: { idempotencyKey: 'fixed' } });
    await assert.rejects(forgetCustomer(f.vault, f.carts, actor, tracking), /saved order/);
    await assert.rejects(storeCustomer(f.vault, f.carts, actor, session('b'), tracking), /original account/);
    assert.equal(restoredActor(await f.vault.read('pending'), null, null), actor);
    assert.equal((await f.vault.read('pending')).payload.idempotencyKey, 'fixed');
  }
  assert.throws(() => restoredActor({ actor: 'a' }, session('b'), null), /another account/);
});
test('logout erases credential, account cart and protected account tracking, preserving guest tracking', async () => {
  const f = fixture(); await f.vault.write('session', session('a')); await f.vault.write('tracking', tracking); await f.carts.setItem(cartKey('a'), 'private selections');
  assert.deepEqual(await forgetCustomer(f.vault, f.carts, 'a', tracking), [tracking[0]]);
  assert.equal(await f.vault.read('session'), null); assert.equal(await f.carts.getItem(cartKey('a')), null);
  assert.deepEqual(await f.vault.read('tracking'), [tracking[0]]); assert.equal(await f.carts.getItem(OWNER_KEY), 'guest');
});
test('failed switch cannot commit a new credential; failed expiry cannot forget the durable account owner', async () => {
  const f = fixture(); await f.vault.write('session', session('a'));
  const broken = { ...f.carts, setItem: async () => { throw new Error('storage unavailable'); } };
  await assert.rejects(storeCustomer(f.vault, broken, 'a', session('b'), tracking), /storage/);
  assert.equal((await f.vault.read('session')).user._id, 'a');
  await assert.rejects(expireCredential(f.vault, broken, 'a'), /storage/);
  assert.equal((await f.vault.read('session')).user._id, 'a');
});
