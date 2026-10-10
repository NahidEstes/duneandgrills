const { test } = require('node:test'); const assert = require('node:assert/strict');
const { protectedStore } = require('../.test-build/services/protected-store');
function fixture() {
  const map = new Map(); let id = 0;
  const driver = { get: async k => map.get(k) ?? null, set: async (k, v) => { assert.ok(Buffer.byteLength(v) < 2048); map.set(k, v); }, delete: async k => { map.delete(k); } };
  return { map, driver, vault: protectedStore(driver, () => `generation-${++id}`) };
}
test('large protected Unicode request round-trips with bounded native values and restart', async () => {
  const f = fixture(); const payload = { customer: 'عنوان 😀'.repeat(1000), token: 'private', items: Array.from({ length: 99 }, (_, i) => ({ id: i })) };
  await f.vault.write('pending', payload); assert.deepEqual(await protectedStore(f.driver, () => 'unused').read('pending'), payload);
  assert.ok(f.map.size > 20); await f.vault.remove('pending'); assert.equal(f.map.size, 0);
});
test('partial chunk and manifest failures retain original pending request and clean failed generation', async () => {
  for (const mode of ['chunk', 'manifest']) {
    const f = fixture(); await f.vault.write('pending', { original: true });
    const old = f.driver.set; f.driver.set = async (k, v) => { if (mode === 'manifest' ? k === 'dg.pending' : k.endsWith('.1')) throw Error('native denied'); return old(k, v); };
    await assert.rejects(f.vault.write('pending', { value: 'x'.repeat(1800) }), /denied/);
    assert.deepEqual(await f.vault.read('pending'), { original: true }); assert.equal(f.map.size, 2);
  }
});
test('incomplete or corrupt protected records fail closed rather than pretending no pending request exists', async () => {
  const f = fixture(); await f.vault.write('pending', { original: true }); f.map.delete('dg.pending.generation-1.0');
  await assert.rejects(f.vault.read('pending'), /incomplete/);
  f.map.set('dg.pending', JSON.stringify({ id: 'generation-1', count: 9999 })); await assert.rejects(f.vault.read('pending'), /invalid/);
});
