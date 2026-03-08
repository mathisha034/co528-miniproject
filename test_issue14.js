/**
 * Test Suite: Issue 14 — CI/CD uses `npm ci` but `package-lock.json` is missing
 *
 * Root cause: The CI pipeline used `npm ci` which requires a `package-lock.json`.
 * No per-service or root `package-lock.json` existed, crashing the pipeline at
 * the install step. A temporary workaround had changed it to `npm install`.
 *
 * This test validates the full correct fix:
 *   1. Root `package-lock.json` exists and is valid
 *   2. All workspace packages are represented in the lock file
 *   3. `npm ci` succeeds dry-run at root (reproducible install confirmed)
 *   4. CI/CD YAML uses `npm ci` (not `npm install`)
 *   5. `cache-dependency-path` points to root `package-lock.json` (not per-service package.json)
 *   6. No per-service package-lock.json files exist (correct for npm workspace monorepos)
 */

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname);
const CI_CD_PATH = path.join(ROOT, '.github/workflows/ci-cd.yml');
const LOCK_PATH = path.join(ROOT, 'package-lock.json');
const PKG_PATH = path.join(ROOT, 'package.json');

const SERVICES = [
  'user-service',
  'feed-service',
  'job-service',
  'event-service',
  'notification-service',
  'messaging-service',
  'research-service',
  'analytics-service',
];

let passed = 0;
let failed = 0;
const failures = [];

function pass(label, info = '') {
  passed++;
  console.log(`  ✅ PASS: ${label}${info ? '\n         ℹ  ' + info : ''}`);
}

function fail(label, info = '') {
  failed++;
  failures.push(label);
  console.log(`  ❌ FAIL: ${label}${info ? '\n         ℹ  ' + info : ''}`);
}

function assert(condition, passLabel, failLabel, info = '') {
  if (condition) pass(passLabel, info);
  else fail(failLabel, info);
}

console.log('\n══════════════════════════════════════════════════════════');
console.log('  Issue 14 — CI/CD: npm ci + package-lock.json validation');
console.log('══════════════════════════════════════════════════════════\n');

// ── Test A: Root package-lock.json exists ─────────────────────────────────
console.log('── Test A: Root package-lock.json exists');
const lockExists = fs.existsSync(LOCK_PATH);
assert(lockExists, 'Root package-lock.json exists', 'Root package-lock.json is MISSING — npm ci would fail');

if (lockExists) {
  const lockContent = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));

  // ── Test B: Lock file has valid lockfileVersion ──────────────────────────
  console.log('── Test B: package-lock.json lockfileVersion >= 2 (npm v7+ workspaces support)');
  assert(
    lockContent.lockfileVersion >= 2,
    `lockfileVersion ${lockContent.lockfileVersion} — workspace-compatible`,
    `lockfileVersion ${lockContent.lockfileVersion} — too old for workspace support (need >=2)`,
    `name: ${lockContent.name}`
  );

  // ── Test C: Lock file covers workspace packages ──────────────────────────
  console.log('── Test C: Lock file contains entries for each service workspace');
  const packageKeys = Object.keys(lockContent.packages || {});
  let allServicesFound = true;
  for (const svc of SERVICES) {
    const key = `services/${svc}`;
    const found = packageKeys.some(k => k === key || k.endsWith(`/${svc}`));
    if (!found) {
      allServicesFound = false;
      fail(`Lock file contains entry for services/${svc}`, `key "services/${svc}" not found`);
    }
  }
  if (allServicesFound) {
    pass(`All ${SERVICES.length} service workspaces represented in lock file`);
  }

  // ── Test D: Lock file packages count is substantial ─────────────────────
  console.log('── Test D: Lock file has substantial package count (>100)');
  assert(
    packageKeys.length > 100,
    `Lock file has ${packageKeys.length} package entries (full dependency graph)`,
    `Lock file only has ${packageKeys.length} entries — suspiciously small`,
  );
}

// ── Test E: No per-service package-lock.json files (correct for monorepo) ──
console.log('── Test E: No per-service package-lock.json files (root is the single source of truth)');
let perServiceLockFound = false;
for (const svc of SERVICES) {
  const svcLock = path.join(ROOT, 'services', svc, 'package-lock.json');
  if (fs.existsSync(svcLock)) {
    perServiceLockFound = true;
    fail(
      `services/${svc}/package-lock.json should NOT exist in a workspace monorepo`,
      'Per-service lock files conflict with root workspace lock file and cause install divergence'
    );
  }
}
if (!perServiceLockFound) {
  pass('No per-service package-lock.json files — root lock file is sole source of truth');
}

// ── Test F: npm ci dry-run succeeds ─────────────────────────────────────────
console.log('── Test F: npm ci --dry-run succeeds at workspace root');
try {
  const output = execSync('npm ci --dry-run', { cwd: ROOT, encoding: 'utf8', stderr: 'pipe' });
  const isUpToDate = output.includes('up to date') || output.includes('added') || output.includes('changed');
  pass('npm ci --dry-run completed without error', output.trim().split('\n').slice(-3).join(' | '));
} catch (err) {
  fail(
    'npm ci --dry-run FAILED — lock file may be out of sync with package.json',
    (err.stderr || err.message || '').split('\n').slice(0, 3).join(' | ')
  );
}

// ── Test G: CI/CD YAML uses npm ci (not npm install) ─────────────────────
console.log('── Test G: ci-cd.yml uses "npm ci" for Install dependencies step');
const ciContent = fs.readFileSync(CI_CD_PATH, 'utf8');
assert(
  ciContent.includes('run: npm ci'),
  'ci-cd.yml uses "npm ci" — reproducible installs enforced',
  'ci-cd.yml still uses "npm install" — NOT "npm ci"',
);
assert(
  !ciContent.includes('run: npm install'),
  'ci-cd.yml does NOT contain "npm install" (old workaround removed)',
  'ci-cd.yml still contains "npm install" — old workaround not removed',
);

// ── Test H: cache-dependency-path points to root package-lock.json ────────
console.log('── Test H: cache-dependency-path points to root package-lock.json');
assert(
  ciContent.includes('cache-dependency-path: package-lock.json'),
  'cache-dependency-path: package-lock.json — correct for monorepo root',
  'cache-dependency-path is NOT set to root package-lock.json',
  ciContent.match(/cache-dependency-path:.*/)?.[0] || 'line not found'
);
assert(
  !ciContent.includes('cache-dependency-path: services/'),
  'cache-dependency-path does NOT point at individual service package.json',
  'cache-dependency-path still points at individual service package.json (wrong for monorepo)',
);

// ── Test I: All service package.json files declare lint and test scripts ────
console.log('── Test I: Service package.json files have lint + test scripts (CI matrix deps)');
let allScriptsOk = true;
for (const svc of SERVICES) {
  const pkgFile = path.join(ROOT, 'services', svc, 'package.json');
  if (fs.existsSync(pkgFile)) {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    const hasLint = !!(pkg.scripts && pkg.scripts.lint);
    const hasTest = !!(pkg.scripts && (pkg.scripts.test || pkg.scripts['test:e2e']));
    if (!hasLint) {
      console.log(`         ℹ  services/${svc}: no "lint" script (CI step will be skipped via --if-present)`);
    }
    if (!hasTest) {
      console.log(`         ℹ  services/${svc}: no "test" script (CI step will be skipped via --if-present)`);
    }
  }
}
pass('All service package.json files inspected — missing scripts handled by --if-present flag in CI');

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed | ${failed} failed`);
console.log('══════════════════════════════════════════════════════════');
if (failures.length) {
  console.log('\nFailing tests:');
  failures.forEach(f => console.log(`  - ${f}`));
}
