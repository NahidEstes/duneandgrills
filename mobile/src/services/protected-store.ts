import type { Vault } from './order-request';
export type ProtectedDriver = { get: (key: string) => Promise<string | null>; set: (key: string, value: string) => Promise<void>; delete: (key: string) => Promise<void> };
// Manifest-last commit: incomplete writes never replace the old complete value.
// Chunking keeps each native value below historical iOS Keychain size limits.
export function protectedStore(driver: ProtectedDriver, createId: () => string): Vault {
  const name = (key: string) => `dg.${key}`;
  const manifest = async (key: string): Promise<{ id: string; count: number } | null> => {
    const raw = await driver.get(name(key)); if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value.id !== 'string' || !/^[A-Za-z0-9-]+$/.test(value.id) || !Number.isInteger(value.count) || value.count < 1 || value.count > 512) throw new Error('Protected storage manifest is invalid');
    return value;
  };
  const clean = async (key: string, m: { id: string; count: number }) => {
    for (let i = 0; i < m.count; i++) await driver.delete(`${name(key)}.${m.id}.${i}`).catch(() => {});
  };
  return {
    async read<T>(key: string): Promise<T | null> {
      const m = await manifest(key); if (!m) return null;
      const parts = [];
      for (let i = 0; i < m.count; i++) {
        const part = await driver.get(`${name(key)}.${m.id}.${i}`);
        if (part === null) throw new Error('Protected storage is incomplete. Contact support before ordering.');
        parts.push(part);
      }
      return JSON.parse(parts.join(''));
    },
    async write(key, value) {
      const old = await manifest(key); const id = createId();
      const raw = JSON.stringify(value); const count = Math.ceil(raw.length / 400);
      if (count > 512 || count < 1) throw new Error('This request is too large to save securely');
      try {
        for (let i = 0; i < count; i++) await driver.set(`${name(key)}.${id}.${i}`, raw.slice(i * 400, (i + 1) * 400));
        await driver.set(name(key), JSON.stringify({ id, count }));
      } catch (e) { await clean(key, { id, count }); throw e; }
      if (old) await clean(key, old);
    },
    async remove(key) {
      const old = await manifest(key); await driver.delete(name(key)); if (old) await clean(key, old);
    },
  };
}
