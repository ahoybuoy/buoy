#!/usr/bin/env node
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

// Find the @buoy-design/cli bin entry
const require = createRequire(import.meta.url);
const cliPkg = require.resolve('@buoy-design/cli/package.json');
const cliDir = dirname(cliPkg);
const cliBin = resolve(cliDir, 'dist', 'bin.js');

// Forward all args to the real CLI
try {
  execFileSync(process.execPath, [cliBin, ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: process.env,
  });
} catch (e) {
  process.exit(e.status ?? 1);
}
