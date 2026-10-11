// Export an isolated copy for browser diagnostics. The app/provider/navigation
// and protectedStore are unchanged; unavailable native storage and dialer
// adapters are substituted. No test switch enters the production app.
const fs = require('node:fs'); const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..'); fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
// Keep the copy on the workspace drive: Metro's asset paths cannot cross
// Windows drive letters during static export.
const temporary = fs.mkdtempSync(path.join(root, 'artifacts/profile-harness-'));
for (const name of ['src', 'assets', 'scripts']) fs.cpSync(path.join(root, name), path.join(temporary, name), { recursive: true });
for (const name of ['package.json', 'app.json', 'app.config.js', 'tsconfig.json']) fs.copyFileSync(path.join(root, name), path.join(temporary, name));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), 'junction');
fs.writeFileSync(path.join(temporary, 'metro.config.js'), `const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname); config.watchFolders = [${JSON.stringify(root)}]; config.cacheVersion = __dirname;
config.resolver.nodeModulesPaths = [${JSON.stringify(path.join(root, 'node_modules'))}]; module.exports = config;`);
fs.writeFileSync(path.join(temporary, 'src/services/storage.ts'), `
import * as Crypto from 'expo-crypto';
import { protectedStore } from './protected-store';
import type { Vault } from './order-request';
const values = new Map<string, string>();
const memory = protectedStore({ get: async key => values.get(key) ?? null, set: async (key, value) => { values.set(key, value); }, delete: async key => { values.delete(key); } }, Crypto.randomUUID);
const fixture = typeof window === 'undefined' ? {} : (window as any).__profileFixture || {};
const initialized = Promise.all(Object.entries(fixture).map(([key, value]) => memory.write(key, value)));
export const vault: Vault = { async read<T>(key: string) { await initialized; return memory.read<T>(key); }, async write(key, value) { await initialized; await memory.write(key, value); }, async remove(key) { await initialized; await memory.remove(key); } };
if (typeof window !== 'undefined') (window as any).__profileTestVault = vault;
`);
const profile = path.join(temporary, 'src/app/(tabs)/profile.tsx');
fs.writeFileSync(profile, fs.readFileSync(profile, 'utf8').replace("from 'expo-linking'", "from '../../services/profile-linking-fixture'"));
fs.writeFileSync(path.join(temporary, 'src/services/profile-linking-fixture.ts'), `export async function openURL(url: string) {
  const browser = window as any; (browser.__profileContactUrls ||= []).push(url);
  if (browser.__profileContactFailure) throw new Error('Fixture has no dialer');
}`);
const output = path.join(root, 'artifacts/profile-harness-dist');
console.log('Diagnostic copy:', temporary);
const child = spawn(process.execPath, [path.join(root, 'node_modules/expo/bin/cli'), 'export', '--clear', '--platform', 'web', '--output-dir', output, '--max-workers', '2'], { cwd: temporary, stdio: 'inherit', windowsHide: true, env: { ...process.env, CI: '1' } });
child.on('exit', code => { process.exitCode = code ?? 1; });
