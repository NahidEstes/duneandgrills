const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { spawnSync } = require('node:child_process');
const out = path.join(__dirname, '../.test-build');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'notebook.cjs'), ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/domain/notebook.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
const result = spawnSync(process.execPath, ['--test', path.join(__dirname, 'notebook.test.cjs')], { stdio: 'inherit', windowsHide: true });
process.exitCode = result.status ?? 1;
