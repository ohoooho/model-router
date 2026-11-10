#!/usr/bin/env node
// Stopgap compatibility patch for the published p5 OMR tarball.
//
// The p5 build shipped a CLI/web branding mismatch:
//   - CLI called /api/ccr/rpc while the web server serves /api/omr/rpc
//   - CLI used CCR_SERVICE_INSTANCE_TOKEN while the web server checks OMR_SERVICE_INSTANCE_TOKEN
//   - CLI read ccr_web_token while the service URL carries omr_web_token
//   - getConfigState read provider.disabled instead of provider.enabled
//
// The source fixes are already in the OMR git history. This script keeps
// existing offline p5 tarballs usable until the next OMR artifact is built.
// It is idempotent and only replaces exact known strings; unknown builds are
// left untouched.

import fs from 'node:fs';

const file = (process.env.OMR_CLI_FILE || process.argv[2] || '').trim();
if (!file || !fs.existsSync(file)) {
  console.log('omr compat: CLI file not found; skip');
  process.exit(0);
}

const replacements = [
  ['/api/ccr/rpc', '/api/omr/rpc'],
  ['CCR_SERVICE_INSTANCE_TOKEN', 'OMR_SERVICE_INSTANCE_TOKEN'],
  ['ccr_web_token', 'omr_web_token'],
  ['enabled:r.disabled!==!0', 'enabled:r.enabled!==!1'],
];

let text = fs.readFileSync(file, 'utf8');
let changed = false;
for (const [from, to] of replacements) {
  const count = text.split(from).length - 1;
  if (count === 1) {
    text = text.replace(from, to);
    changed = true;
    console.log(`omr compat: ${from} -> ${to}`);
  } else if (count > 1) {
    console.warn(`omr compat: skipped ${from} (${count} occurrences)`);
  }
}

if (!changed) {
  console.log('omr compat: CLI already uses OMR names');
  process.exit(0);
}

const backup = `${file}.taoxian-compat-backup`;
if (!fs.existsSync(backup)) {
  fs.copyFileSync(file, backup);
  try { fs.chmodSync(backup, 0o600); } catch {}
}
const mode = fs.statSync(file).mode & 0o777;
fs.writeFileSync(file, text, { mode });
console.log(`omr compat: patched ${file}`);
