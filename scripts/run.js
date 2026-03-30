#!/usr/bin/env node
const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const pkg = require("../package.json");
const binName = Object.keys(pkg.bin)[0];
const ext = process.platform === "win32" ? ".exe" : "";
const bin = path.join(__dirname, "..", "bin", binName + ext);

if (!fs.existsSync(bin)) {
  console.error(
    `${binName} binary not found at: ${bin}\n` +
      `The installation may have failed. To fix this:\n` +
      `  1. Reinstall the package globally:\n` +
      `       npm install -g ${pkg.name}\n` +
      `  2. Or just re-run the install script:\n` +
      `       node $(npm root -g)/${pkg.name}/scripts/install.js\n` +
      `       node $(pnpm root -g)/${pkg.name}/scripts/install.js`
  );
  process.exit(1);
}

try {
  execFileSync(bin, process.argv.slice(2), { stdio: "inherit" });
} catch (e) {
  if (e.code && !e.status) {
    console.error(`Failed to run ${binName}: ${e.message}`);
  }
  process.exit(e.status || 1);
}
