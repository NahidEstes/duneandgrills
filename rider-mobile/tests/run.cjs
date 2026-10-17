const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
for (const name of ['domain/rider', 'services/action-journal']) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', name + '.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const file = path.join(__dirname, '../.test-build', name + '.js');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, code);
}
const result = spawnSync(process.execPath, ['--test', ...fs.readdirSync(__dirname).filter(name => name.endsWith('.test.cjs')).map(name => path.join(__dirname, name))], { stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
