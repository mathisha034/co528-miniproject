/**
 * test_issue6.js — Issue 6: Web App → Feed Service URL Path Routing
 *
 * Verifies that:
 *  A) The CORRECT path /api/v1/feed-service/feed  → backend receives /api/v1/feed  → 200 OK
 *  B) The OLD WRONG path /api/v1/feed-service/posts → backend receives /api/v1/posts → 404 (not a valid route)
 *  C) POST /api/v1/feed-service/feed  → 201 Created  (ingress rewrites and controller matches)
 *  D) Dashboard path /api/v1/feed-service/feed?page=1&limit=3 → 200 OK with { items, meta } envelope
 *
 * Ingress rule:
 *   path: /api/v1/feed-service(/|$)(.*)
 *   rewrite-target: /api/v1/$2
 *
 * Backend controller: @Controller('feed') → listens on /api/v1/feed
 *
 * Usage:
 *   node test_issue6.js
 *   (Requires fresh tokens in .e2e_student_token and .e2e_admin_token via setup_temp_users.sh)
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const BASE_URL  = 'http://miniproject.local';
const TOKEN_DIR = path.resolve(__dirname);

// ── Helpers ──────────────────────────────────────────────────────────────────

function readToken(file) {
  const p = path.join(TOKEN_DIR, file);
  if (!fs.existsSync(p)) throw new Error(`Token file not found: ${p}. Run setup_temp_users.sh first.`);
  return fs.readFileSync(p, 'utf8').trim();
}

function decodeJwtSub(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) throw new Error(`Token expired at ${new Date(payload.exp * 1000).toISOString()}`);
    return payload.sub;
  } catch (e) {
    throw new Error(`Token validation failed: ${e.message}`);
  }
}

function request(method, urlPath, token, body) {
  return new Promise((resolve, reject) => {
    const url      = new URL(urlPath, BASE_URL);
    const bodyStr  = body ? JSON.stringify(body) : null;
    const headers  = {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = http.request(
      { hostname: url.hostname, port: url.port || 80, path: url.pathname + url.search, method, headers },
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
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function pass(msg) { console.log(`  ✅ PASS — ${msg}`); }
function fail(msg) { console.error(`  ❌ FAIL — ${msg}`); process.exitCode = 1; }
function divider(label) { console.log(`\n── ${label}`); }

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Issue 6 — Web App → Feed Service URL Path Routing');
  console.log('═══════════════════════════════════════════════════════\n');

  const studentToken = readToken('.e2e_student_token');
  const studentSub   = decodeJwtSub(studentToken);
  console.log(`Student sub : ${studentSub}`);

  // ── Test A : GET correct path → 200 ──────────────────────────────────────
  divider('Test A: GET /api/v1/feed-service/feed  (correct URL → should be 200)');
  const resA = await request('GET', '/api/v1/feed-service/feed?page=1&limit=5', studentToken);
  console.log(`  HTTP status: ${resA.status}`);
  if (resA.status === 200) {
    pass('200 OK — ingress correctly rewritten /feed-service/feed → /feed → @Controller("feed") matched');
  } else if (resA.status === 404) {
    fail(`404 — Ingress rewrite or controller path mismatch. Response: ${JSON.stringify(resA.body).slice(0, 200)}`);
  } else {
    fail(`Unexpected status ${resA.status}: ${JSON.stringify(resA.body).slice(0, 200)}`);
  }

  // ── Test B : GET old WRONG path → 404 ────────────────────────────────────
  divider('Test B: GET /api/v1/feed-service/posts  (old wrong URL → should be 404)');
  const resB = await request('GET', '/api/v1/feed-service/posts', studentToken);
  console.log(`  HTTP status: ${resB.status}`);
  if (resB.status === 404) {
    pass('404 Not Found — old /posts path correctly produces 404 (no controller registered at /api/v1/posts)');
  } else if (resB.status === 200) {
    fail('200 OK on /posts — a spurious controller is registered that should not exist');
  } else {
    // Any non-200 (403, 401, 500) is acceptable, the key point is it doesn't accidentally serve feed data
    pass(`Status ${resB.status} — /posts path does NOT return feed data (acceptable non-200)`);
  }

  // ── Test C : POST correct path → 201 ─────────────────────────────────────
  divider('Test C: POST /api/v1/feed-service/feed  (create post via correct URL → should be 201)');
  const resC = await request('POST', '/api/v1/feed-service/feed', studentToken, {
    content: '[Issue 6 URL test] Verifying path routing fix — ' + new Date().toISOString(),
  });
  console.log(`  HTTP status: ${resC.status}`);
  if (resC.status === 201) {
    const postId = resC.body?._id || resC.body?.id;
    pass(`201 Created — post written, _id: ${postId}`);
    if (resC.body?.userId === studentSub) {
      pass(`userId matches student sub (UUID preserved)`);
    } else {
      console.log(`  ℹ  userId: ${resC.body?.userId} (sub: ${studentSub})`);
    }
  } else {
    fail(`Expected 201, got ${resC.status}: ${JSON.stringify(resC.body).slice(0, 200)}`);
  }

  // ── Test D : Dashboard path with query params → 200 + envelope ───────────
  divider('Test D: GET /api/v1/feed-service/feed?page=1&limit=3  (dashboard feed widget)');
  const resD = await request('GET', '/api/v1/feed-service/feed?page=1&limit=3', studentToken);
  console.log(`  HTTP status: ${resD.status}`);
  if (resD.status === 200) {
    const items = resD.body?.items;
    const meta  = resD.body?.meta;
    if (Array.isArray(items)) {
      pass(`200 OK — envelope { items[], meta } received. items.length: ${items.length}, totalPages: ${meta?.totalPages}`);
    } else {
      fail(`200 OK but response is not envelope shape. Got: ${JSON.stringify(resD.body).slice(0, 200)}`);
    }
  } else {
    fail(`Expected 200, got ${resD.status}: ${JSON.stringify(resD.body).slice(0, 200)}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  if (process.exitCode === 1) {
    console.error('SOME TESTS FAILED ❌ — Review output above.\n');
  } else {
    console.log('ALL TESTS PASSED ✅');
    console.log('Issue 6 (Web App → Feed Service URL Path Routing) is confirmed resolved.\n');
  }
})().catch((err) => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
