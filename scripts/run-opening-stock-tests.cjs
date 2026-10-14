// Compiles the Opening Stock rules and their tests to a temp folder with the project's TypeScript, then runs them with node:test.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'node_modules', '.cache', 'opening-stock-test');
fs.rmSync(out, { recursive: true, force: true });
const tsc = require.resolve('typescript/bin/tsc', { paths: [root] });
execFileSync(process.execPath, [tsc, '--ignoreConfig', '--noCheck', '--outDir', out, '--module', 'commonjs', '--target', 'es2022', '--skipLibCheck', '--esModuleInterop', '--moduleResolution', 'node10', '--ignoreDeprecations', '6.0', path.join(__dirname, 'opening-stock.test.ts')], { stdio: 'inherit', cwd: root });
const test = path.join(out, 'scripts', 'opening-stock.test.js');
execFileSync(process.execPath, ['--test', test], { stdio: 'inherit', cwd: root });
