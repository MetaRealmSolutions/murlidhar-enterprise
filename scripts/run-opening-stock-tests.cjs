// Compiles the pure-logic modules and their tests (scripts/*.test.ts) to a cache folder with the project's TypeScript, then runs them with node:test.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'node_modules', '.cache', 'opening-stock-test');
fs.rmSync(out, { recursive: true, force: true });
const tsc = require.resolve('typescript/bin/tsc', { paths: [root] });
const tests = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.ts')).map((f) => path.join(__dirname, f));
execFileSync(process.execPath, [tsc, '--ignoreConfig', '--noCheck', '--outDir', out, '--module', 'commonjs', '--target', 'es2022', '--skipLibCheck', '--esModuleInterop', '--moduleResolution', 'node10', '--ignoreDeprecations', '6.0', ...tests], { stdio: 'inherit', cwd: root });
const compiled = tests.map((f) => path.join(out, 'scripts', path.basename(f).replace(/\.ts$/, '.js')));
execFileSync(process.execPath, ['--test', ...compiled], { stdio: 'inherit', cwd: root });
