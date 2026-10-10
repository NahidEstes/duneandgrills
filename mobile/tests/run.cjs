// Compile the actual pure TS modules with the installed compiler, then test
// them with Node's runner. Native modules are tested through the device gate.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
for (const name of ['domain/cart', 'domain/orders', 'services/api-client', 'services/order-request', 'services/protected-store', 'services/session']) {
  const source = fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8');
  const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const file = path.join(__dirname, '../.test-build', name + '.js');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, result.outputText);
}
const result = spawnSync(process.execPath, ['--test', ...fs.readdirSync(__dirname).filter(n => n.endsWith('.test.cjs')).map(n => path.join(__dirname, n))], { stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
