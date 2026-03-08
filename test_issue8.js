/**
 * test_issue8.js — Issue 8: Web App → Analytics Service Wrong URL Path
 *
 * Stated bug:
 *   Web app was calling GET /api/v1/analytics-service/overview
 *   Ingress rewrite-target: /api/v1/$2 → forwards to GET /api/v1/overview
 *   But Analytics controller uses @Controller('analytics'), so the server
 *   only accepts GET /api/v1/analytics/overview → 404 on every Dashboard load.
 *
 * Fix applied:
 *   web/src/pages/Dashboard/Dashboard.tsx  → /api/v1/analytics-service/analytics/overview
 *   web/src/pages/Analytics/Analytics.tsx  → /api/v1/analytics-service/analytics/overview
 *
 * Ingress routing:
 *   /api/v1/analytics-service(/|$)(.*) → rewrite-target: /api/v1/$2
 *   So /api/v1/analytics-service/analytics/overview → /api/v1/analytics/overview ✓
 *
 * Tests:
 *  A) CORRECT path → 200 OK  (URL routing is fixed)
 *  B) OLD WRONG path → 404   (non-existent bare /overview confirm regression stays gone)
 *  C) Response shape → { users, posts, jobs, events } all numeric ≥ 0
 *  D) Dashboard stat card binding → each key is a number (setStats(res.data) works)
 *  E) Secondary endpoint GET /analytics-service/analytics/posts → 200 OK
 *  F) Secondary endpoint GET /analytics-service/analytics/jobs  → 200 OK
 *  G) Secondary endpoint GET /analytics-service/analytics/users → 200 OK
 *  H) Admin-only endpoint GET /analytics-service/analytics/latencies → 200 OK with admin token
 *     (or graceful error if Prometheus unreachable — not a routing failure)
 *
 * Note on events count:
 *   The running analytics-service:v3 uses collection('events') while the actual MongoDB
 *   collection is 'evententities'. This causes events=0 in the overview response.
 *   This is a separate Issue 34 concern. For Issue 8 (URL routing), events=0 is acceptable.
 *
 * Usage:
 *   node test_issue8.js
 *   (Requires .e2e_student_token and .e2e_admin_token from setup_temp_users.sh)
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const BASE_URL  = 'http://miniproject.local';
const TOKEN_DIR = path.resolve(__dirname);

// ── Helpers ───────────────────────────────────────────────────────────────────

function readToken(file) {
  const p = path.join(TOKEN_DIR, file);
  if (!fs.existsSync(p)) throw new Error(`Token file not found: ${p}. Run setup_temp_users.sh first.`);
  return fs.readFileSync(p, 'utf8').trim();
}

function decodeJwtPayload(token) {
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) throw new Error(`Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
  return payload;
}

function request(method, urlPath, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const req = http.request(
      {
        hostname: url.hostname,
        port:     url.port || 80,
        path:     url.pathname + url.search,
        method,
        headers: { Authorization: `Bearer ${token}` },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function pass(msg)    { console.log(`  ✅ PASS — ${msg}`); passed++; }
function fail(msg)    { console.error(`  ❌ FAIL — ${msg}`); failed++; }
function info(msg)    { console.log(`  ℹ  ${msg}`); }
function divider(lbl) { console.log(`\n── ${lbl}`); }

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Issue 8 — Web App → Analytics Service: Wrong URL Path');
  console.log('══════════════════════════════════════════════════════════\n');

  const studentToken  = readToken('.e2e_student_token');
  const adminToken    = readToken('.e2e_admin_token');
  const studentPayload = decodeJwtPayload(studentToken);
  const adminPayload   = decodeJwtPayload(adminToken);
  console.log(`Student sub : ${studentPayload.sub}`);
  console.log(`Admin sub   : ${adminPayload.sub}`);

  // ── Test A: Correct URL → 200 ─────────────────────────────────────────────
  divider('Test A: GET /api/v1/analytics-service/analytics/overview  (correct URL → 200)');
  const resA = await request('GET', '/api/v1/analytics-service/analytics/overview', studentToken);
  console.log(`  HTTP status: ${resA.status}`);
  if (resA.status === 200) {
    pass('200 OK — ingress correctly rewrites /analytics-service/analytics/overview → /analytics/overview → @Controller("analytics") matched');
  } else if (resA.status === 404) {
    fail(`404 — path still not reaching @Controller("analytics"). Check ingress rule and controller prefix.`);
  } else if (resA.status === 401 || resA.status === 403) {
    fail(`${resA.status} — auth error. Ensure token is valid and analytics-service reads KEYCLOAK_PUBLIC_KEY.`);
  } else {
    fail(`Unexpected status ${resA.status}: ${JSON.stringify(resA.body).slice(0, 200)}`);
  }

  // ── Test B: Old wrong URL → 404 ───────────────────────────────────────────
  divider('Test B: GET /api/v1/analytics-service/overview  (old wrong URL → should be 404)');
  const resB = await request('GET', '/api/v1/analytics-service/overview', studentToken);
  console.log(`  HTTP status: ${resB.status}`);
  if (resB.status === 404) {
    pass('404 — bare /overview path is NOT matched (no controller at /api/v1/overview). Original issue confirmed fixed.');
  } else if (resB.status === 200) {
    fail('200 on old /overview path — a spurious route is registered that should not exist. Frontend can accidentally call the wrong endpoint.');
  } else {
    // 401/403 on wrong path is also acceptable — it means the path doesn't match a public endpoint
    pass(`Status ${resB.status} — old /overview path does NOT return analytics data (not 200)`);
  }

  // ── Test C: Response shape ────────────────────────────────────────────────
  divider('Test C: Response shape — { users, posts, jobs, events } all numeric ≥ 0');
  const overview = resA.body;
  if (resA.status !== 200) {
    fail('Skipped — Test A did not return 200, cannot validate response shape');
  } else {
    const fields = ['users', 'posts', 'jobs', 'events'];
    const missingFields = fields.filter(f => overview[f] === undefined);
    if (missingFields.length === 0) {
      pass(`All required fields present: ${fields.join(', ')}`);
    } else {
      fail(`Missing fields: ${missingFields.join(', ')} — Dashboard StatData cannot be populated`);
    }

    const nonNumericFields = fields.filter(f => typeof overview[f] !== 'number');
    if (nonNumericFields.length === 0) {
      pass(`All fields are numbers: users=${overview.users}, posts=${overview.posts}, jobs=${overview.jobs}, events=${overview.events}`);
    } else {
      fail(`Non-numeric fields: ${nonNumericFields.map(f => `${f}=${typeof overview[f]}`).join(', ')}`);
    }

    const negativeFields = fields.filter(f => typeof overview[f] === 'number' && overview[f] < 0);
    if (negativeFields.length === 0) {
      pass('All counts are ≥ 0 (valid)');
    } else {
      fail(`Negative counts: ${negativeFields.map(f => `${f}=${overview[f]}`).join(', ')}`);
    }

    // Note about Issue 34 — don't fail the test, just report
    if (overview.events === 0) {
      info('events=0 — this is expected from Issue 34 (v3 uses collection("events") but actual collection is "evententities"). Does NOT affect URL routing correctness. Tracked separately.');
    } else {
      pass(`events=${overview.events} > 0 — analytics-service resolves correct events collection`);
    }
  }

  // ── Test D: Dashboard stat card shape ─────────────────────────────────────
  divider('Test D: Dashboard binding — res.data directly maps to StatData interface');
  if (resA.status === 200) {
    // Simulate Dashboard.tsx: setStats(res.data)
    const stats = overview;
    if (
      typeof stats.users  === 'number' &&
      typeof stats.posts  === 'number' &&
      typeof stats.jobs   === 'number' &&
      typeof stats.events === 'number'
    ) {
      pass(`StatData interface satisfied: { users:${stats.users}, posts:${stats.posts}, jobs:${stats.jobs}, events:${stats.events} }`);
    } else {
      fail(`res.data does not match StatData interface — Dashboard stat cards will render 0 or undefined`);
    }
  } else {
    fail('Skipped — Test A did not return 200');
  }

  // ── Test E: GET /analytics/posts → 200 ───────────────────────────────────
  divider('Test E: GET /api/v1/analytics-service/analytics/posts  (popular posts)');
  const resE = await request('GET', '/api/v1/analytics-service/analytics/posts?limit=3', studentToken);
  console.log(`  HTTP status: ${resE.status}`);
  if (resE.status === 200) {
    if (Array.isArray(resE.body)) {
      pass(`200 OK — array of ${resE.body.length} post(s) returned`);
    } else {
      fail(`200 OK but body is not an array: ${typeof resE.body}`);
    }
  } else {
    fail(`Expected 200, got ${resE.status}: ${JSON.stringify(resE.body).slice(0, 150)}`);
  }

  // ── Test F: GET /analytics/jobs → 200 ────────────────────────────────────
  divider('Test F: GET /api/v1/analytics-service/analytics/jobs  (job application counts)');
  const resF = await request('GET', '/api/v1/analytics-service/analytics/jobs', studentToken);
  console.log(`  HTTP status: ${resF.status}`);
  if (resF.status === 200) {
    if (Array.isArray(resF.body)) {
      pass(`200 OK — array of ${resF.body.length} job aggregation(s) returned`);
    } else {
      fail(`200 OK but body is not an array: ${typeof resF.body}`);
    }
  } else {
    fail(`Expected 200, got ${resF.status}: ${JSON.stringify(resF.body).slice(0, 150)}`);
  }

  // ── Test G: GET /analytics/users → 200 ───────────────────────────────────
  divider('Test G: GET /api/v1/analytics-service/analytics/users  (user registrations)');
  const resG = await request('GET', '/api/v1/analytics-service/analytics/users?days=7', studentToken);
  console.log(`  HTTP status: ${resG.status}`);
  if (resG.status === 200) {
    if (Array.isArray(resG.body)) {
      pass(`200 OK — array of ${resG.body.length} daily registration bucket(s) returned`);
    } else {
      fail(`200 OK but body is not an array: ${typeof resG.body}`);
    }
  } else {
    fail(`Expected 200, got ${resG.status}: ${JSON.stringify(resG.body).slice(0, 150)}`);
  }

  // ── Test H: GET /analytics/latencies (admin-only) → 200 ──────────────────
  divider('Test H: GET /api/v1/analytics-service/analytics/latencies  (admin only + Prometheus)');
  const resH = await request('GET', '/api/v1/analytics-service/analytics/latencies', adminToken);
  console.log(`  HTTP status: ${resH.status}`);
  if (resH.status === 200) {
    pass('200 OK — admin token accepted by @Roles("admin") guard');
    // Prometheus may be unreachable in test env — check graceful handling
    if (resH.body?.status === 'error') {
      info('Prometheus unreachable (expected in local test env) — service handled it gracefully, did not 500');
    } else {
      info(`Prometheus response: status=${resH.body?.status}`);
    }
  } else if (resH.status === 403) {
    fail('403 — admin token rejected by RolesGuard. Check role claim mapping in jwt.strategy.ts');
  } else if (resH.status === 401) {
    fail('401 — admin token not accepted by JwtAuthGuard');
  } else {
    fail(`Expected 200, got ${resH.status}: ${JSON.stringify(resH.body).slice(0, 150)}`);
  }

  // Confirm student cannot access latencies (RBAC test)
  const resH2 = await request('GET', '/api/v1/analytics-service/analytics/latencies', studentToken);
  if (resH2.status === 403) {
    pass('Student correctly receives 403 on admin-only /latencies endpoint (RBAC enforced)');
  } else if (resH2.status === 200) {
    fail('Student can access admin-only /latencies — RolesGuard is not enforcing admin role');
  } else {
    info(`Student /latencies returned ${resH2.status} — expected 403`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('SOME TESTS FAILED ❌ — Review output above.\n');
    process.exitCode = 1;
  } else {
    console.log('ALL TESTS PASSED ✅');
    console.log('Issue 8 (Web App → Analytics Service URL routing) is confirmed resolved.\n');
  }
})().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
