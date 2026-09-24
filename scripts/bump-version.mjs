#!/usr/bin/env node
/**
 * Set one version everywhere a release carries it:
 *   node scripts/bump-version.mjs 0.7.4
 * Root and workspace package.json files, the MCP Registry server.json, and
 * the Claude Code plugin manifest.
 */
import { readFileSync, writeFileSync } from "node:fs";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? "")) {
  console.error("usage: node scripts/bump-version.mjs <semver>");
  process.exit(1);
}

const files = [
  "package.json",
  "apps/cli/package.json",
  "packages/core/package.json",
  "packages/scanners/package.json",
  "packages/ahoybuoy/package.json",
  "packages/buoy-design/package.json",
  "apps/cli/server.json",
  "plugins/buoy/.claude-plugin/plugin.json",
];

for (const file of files) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = version;
  if (file.endsWith("server.json")) for (const p of json.packages ?? []) p.version = version;
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`${file} -> ${version}`);
}
