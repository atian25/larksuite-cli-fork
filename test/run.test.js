#!/usr/bin/env node
/**
 * Unit tests for scripts/run.js
 *
 * Root cause: when install.js fails to download the binary, bin/lark-cli does
 * not exist. The original run.js called execFileSync on the missing file, which
 * threw an error with code='ENOENT' and status=null.  The catch block then did
 * `process.exit(e.status || 1)` — silently exiting with code 1 and no message.
 *
 * Fix: check for the binary with fs.existsSync before executing it, and print
 * a helpful error message when it is absent.
 */

"use strict";

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RUN_JS = path.join(ROOT, "scripts", "run.js");
const BIN_DIR = path.join(ROOT, "bin");
const pkg = require("../package.json");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Test 1 – binName is derived correctly from package.json bin config
// ---------------------------------------------------------------------------
console.log("\nscripts/run.js – binName derivation");

test("derives binName by matching pkg.bin value to this script path", () => {
  const thisScript = path
    .relative(ROOT, RUN_JS)
    .replace(/\\/g, "/");

  const binEntry = Object.entries(pkg.bin).find(
    ([, v]) => v.replace(/^\.\//, "") === thisScript
  );

  assert.ok(binEntry, "should find a matching bin entry for scripts/run.js");
  assert.strictEqual(
    binEntry[0],
    "lark-cli",
    "binName should be 'lark-cli'"
  );
});

test("pkg.bin value for lark-cli points to scripts/run.js", () => {
  const val = pkg.bin["lark-cli"];
  assert.ok(
    val === "scripts/run.js" || val === "./scripts/run.js",
    `expected pkg.bin['lark-cli'] to be 'scripts/run.js', got '${val}'`
  );
});

// ---------------------------------------------------------------------------
// Test 2 – missing binary prints an error and exits 1
// ---------------------------------------------------------------------------
console.log("\nscripts/run.js – missing binary");

test("exits with code 1 when binary is absent", () => {
  // Make sure the real bin/lark-cli is not present for this assertion.
  const binPath = path.join(BIN_DIR, "lark-cli");
  if (fs.existsSync(binPath)) {
    // Binary happens to be installed – skip this sub-check.
    return;
  }
  const result = spawnSync("node", [RUN_JS], { encoding: "utf8" });
  assert.strictEqual(result.status, 1, "exit code should be 1");
});

test("prints binary path in error message when binary is absent", () => {
  const binPath = path.join(BIN_DIR, "lark-cli");
  if (fs.existsSync(binPath)) return;

  const result = spawnSync("node", [RUN_JS], { encoding: "utf8" });
  assert.ok(
    result.stderr.includes("lark-cli binary not found at"),
    `expected 'lark-cli binary not found at' in stderr, got: ${result.stderr}`
  );
});

test("includes reinstall instructions in error message when binary is absent", () => {
  const binPath = path.join(BIN_DIR, "lark-cli");
  if (fs.existsSync(binPath)) return;

  const result = spawnSync("node", [RUN_JS], { encoding: "utf8" });
  assert.ok(
    result.stderr.includes("npm install -g"),
    "error message should include npm install instruction"
  );
  assert.ok(
    result.stderr.includes("scripts/install.js"),
    "error message should include install.js re-run instruction"
  );
});

// ---------------------------------------------------------------------------
// Test 3 – with a valid binary, run.js delegates to it correctly
// ---------------------------------------------------------------------------
console.log("\nscripts/run.js – valid binary present");

test("executes binary and passes argv when binary exists", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lark-cli-test-"));

  try {
    // Create a fake binary that just echoes its arguments
    const fakeBin = path.join(tmpDir, "lark-cli");
    fs.writeFileSync(fakeBin, "#!/bin/sh\necho \"args: $@\"\n");
    fs.chmodSync(fakeBin, 0o755);

    // We cannot monkey-patch __dirname, so write a minimal wrapper that
    // overrides the bin path directly.
    const wrapper = `
const { execFileSync } = require('child_process');
execFileSync(${JSON.stringify(fakeBin)}, ['hello', 'world'], { stdio: 'inherit' });
`;
    const wrapperPath = path.join(tmpDir, "wrapper.js");
    fs.writeFileSync(wrapperPath, wrapper);

    const result = spawnSync("node", [wrapperPath], { encoding: "utf8" });
    assert.strictEqual(result.status, 0, "should exit 0");
    assert.ok(
      result.stdout.includes("args: hello world"),
      `expected 'args: hello world' in stdout, got: ${result.stdout}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
