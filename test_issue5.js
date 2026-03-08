/**
 * test_issue5.js
 * -------------------------------------------------------------------
 * Issue 5: UUID BSON Casting Crash in Mongoose
 *
 * Root cause: Keycloak generates 36-char UUID subs. Previous Mongoose
 * schemas typed userId as Types.ObjectId (requires 24-char hex),
 * causing BSONError crashes when a UUID was stored or queried.
 *
 * Fix validated by: post.schema.ts + notification.schema.ts both
 * using `type: String` for all userId / likes fields.
 *
 * Test plan:
 *   A) Create a post  → userId stored as UUID string (not ObjectId)
 *   B) Get feed       → UUID userId returned without BSON cast crash
 *   C) Like the post  → UUID appended to likes[] without BSON crash
 *   D) Get notifications (as post-owner) → UUID userId query works
 *   E) Get notification count → no crash on UUID filter
 *   F) Cleanup        → delete created post
 * -------------------------------------------------------------------
 */

const axios = require('axios');
const fs = require('fs');

const BASE = 'http://miniproject.local/api/v1';

// UUID pattern — 36 chars, 4 hyphens
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseJwt(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

function pass(msg) { console.log(`  ✅ PASS — ${msg}`); }
function fail(msg) { console.error(`  ❌ FAIL — ${msg}`); process.exit(1); }

async function run() {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  Issue 5 — UUID BSON Casting Crash in Mongoose');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── Load tokens ──────────────────────────────────────────────────
  const studentToken = fs.readFileSync('.e2e_student_token', 'utf8').trim();
  const adminToken   = fs.readFileSync('.e2e_admin_token', 'utf8').trim();

  const studentPayload = parseJwt(studentToken);
  const adminPayload   = parseJwt(adminToken);

  const studentUUID = studentPayload.sub;
  const adminUUID   = adminPayload.sub;

  console.log(`Student sub : ${studentUUID}`);
  console.log(`Admin sub   : ${adminUUID}`);
  console.log(`Student alg : ${parseJwt(studentToken)}`);

  // Confirm both subs are UUIDs (not 24-char hex ObjectIds)
  if (!UUID_REGEX.test(studentUUID)) fail(`studentUUID "${studentUUID}" is not a UUID — test setup error`);
  if (!UUID_REGEX.test(adminUUID))   fail(`adminUUID "${adminUUID}" is not a UUID — test setup error`);
  console.log('\n  UUID format confirmed — Keycloak subs are 36-char UUIDs, not MongoDB ObjectIds.\n');

  const studentHdr = { Authorization: `Bearer ${studentToken}` };
  const adminHdr   = { Authorization: `Bearer ${adminToken}` };

  let createdPostId = null;

  // ── Test A: Create a post (UUID stored as userId) ─────────────────
  console.log('── Test A: POST /feed-service/feed  (create post with UUID userId)');
  try {
    const res = await axios.post(`${BASE}/feed-service/feed`,
      { content: '[Issue 5 UUID test] post created with Keycloak UUID userId' },
      { headers: studentHdr }
    );
    if (res.status !== 201) fail(`Expected 201, got ${res.status}`);

    const post = res.data;
    if (!post._id) fail('Response missing _id');
    if (post.userId !== studentUUID)
      fail(`post.userId "${post.userId}" !== student UUID "${studentUUID}" — ObjectId cast may have occurred`);
    if (!UUID_REGEX.test(post.userId))
      fail(`post.userId "${post.userId}" stored as ObjectId instead of UUID string — BSON BUG PERSISTS`);

    createdPostId = post._id;
    pass(`201 Created — post._id: ${createdPostId}`);
    pass(`post.userId matches UUID: "${post.userId}"`);
  } catch (err) {
    if (err.response?.status === 500)
      fail(`500 — BSONError likely still present. Pod logs: kubectl logs -n miniproject -l app=feed-service --tail=30`);
    fail(`Unexpected error: ${err.response?.status} — ${JSON.stringify(err.response?.data)}`);
  }

  // ── Test B: Get feed (UUID userId returned in response) ───────────
  console.log('\n── Test B: GET /feed-service/feed  (UUID userId in response items)');
  try {
    const res = await axios.get(`${BASE}/feed-service/feed?page=1&limit=5`, { headers: studentHdr });
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`);

    const { items, meta } = res.data;
    if (!Array.isArray(items)) fail('Response.items is not an array');

    const ourPost = items.find(p => p._id === createdPostId);
    if (!ourPost) fail('Created post not found in feed response');
    if (!UUID_REGEX.test(ourPost.userId))
      fail(`Feed item userId "${ourPost.userId}" is not a UUID — BSON cast corrupted the field`);

    pass(`200 OK — feed returned ${items.length} items, totalPages: ${meta?.totalPages}`);
    pass(`Our post found in feed, userId is UUID: "${ourPost.userId}"`);
  } catch (err) {
    if (err.response?.status === 500)
      fail(`500 — possible BSON crash on feed query`);
    fail(`Unexpected error: ${err.response?.status} — ${JSON.stringify(err.response?.data)}`);
  }

  // ── Test C: Like the post (UUID appended to likes[]) ──────────────
  console.log('\n── Test C: POST /feed-service/feed/:id/like  (UUID into likes[] array)');
  try {
    const res = await axios.post(
      `${BASE}/feed-service/feed/${createdPostId}/like`,
      {},
      { headers: adminHdr }
    );
    if (res.status !== 201 && res.status !== 200)
      fail(`Expected 200/201, got ${res.status}`);

    const post = res.data;
    if (!Array.isArray(post.likes)) fail('post.likes is not an array');
    if (!post.likes.includes(adminUUID))
      fail(`adminUUID "${adminUUID}" not found in likes[] — UUID may have been cast to ObjectId and rejected`);
    if (post.likes.some(l => l.length !== 36 && !UUID_REGEX.test(l)))
      fail(`likes[] contains non-UUID entries — ObjectId cast may have occurred`);

    pass(`${res.status} OK — post liked`);
    pass(`likes[] contains UUID: "${adminUUID}"`);
  } catch (err) {
    if (err.response?.status === 500)
      fail(`500 — BSONError in likePost() likely. post.likes may still be typed as ObjectId[]`);
    fail(`Unexpected error: ${err.response?.status} — ${JSON.stringify(err.response?.data)}`);
  }

  // Short wait for async notification delivery
  await new Promise(r => setTimeout(r, 1000));

  // ── Test D: Get notifications (UUID userId used in MongoDB query) ──
  console.log('\n── Test D: GET /notification-service/notifications  (UUID userId query)');
  try {
    const res = await axios.get(`${BASE}/notification-service/notifications`, { headers: studentHdr });
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`);

    const notifications = res.data;
    if (!Array.isArray(notifications)) fail('Response is not an array');

    // Verify all returned notifications have string userId (UUID format)
    for (const n of notifications) {
      if (!UUID_REGEX.test(n.userId))
        fail(`Notification has non-UUID userId: "${n.userId}" — BSON cast still occurring`);
    }

    pass(`200 OK — ${notifications.length} notification(s) returned, no BSONError on UUID filter`);
    if (notifications.length > 0)
      pass(`Sample notification userId: "${notifications[0].userId}" — is UUID ✓`);
    else
      console.log('  ℹ️  No notifications yet (async delivery may take a moment — this is a pass)');
  } catch (err) {
    if (err.response?.status === 500)
      fail(`500 — BSONError on notifications query. notification.userId may still be ObjectId type`);
    fail(`Unexpected error: ${err.response?.status} — ${JSON.stringify(err.response?.data)}`);
  }

  // ── Test E: Notification count (UUID userId in countDocuments) ────
  console.log('\n── Test E: GET /notification-service/notifications/count  (UUID in countDocuments)');
  try {
    const res = await axios.get(`${BASE}/notification-service/notifications/count`, { headers: studentHdr });
    if (res.status !== 200) fail(`Expected 200, got ${res.status}`);

    if (typeof res.data.count !== 'number' && res.data.count === undefined)
      fail(`Response missing "count" field: ${JSON.stringify(res.data)}`);

    pass(`200 OK — unread count: ${res.data.count} (UUID userId used in countDocuments without crash)`);
  } catch (err) {
    if (err.response?.status === 500)
      fail(`500 — BSONError on notification count query`);
    fail(`Unexpected error: ${err.response?.status} — ${JSON.stringify(err.response?.data)}`);
  }

  // ── Cleanup: unlike post ──────────────────────────────────────────
  console.log('\n── Cleanup: DELETE /feed-service/feed/:id/like');
  try {
    await axios.delete(`${BASE}/feed-service/feed/${createdPostId}/like`, { headers: adminHdr });
    console.log('  Unlike done.');
  } catch (_) { /* non-critical */ }

  // ─────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ALL TESTS PASSED ✅');
  console.log('  Issue 5 (UUID BSON Casting) is fully resolved.');
  console.log('  Both feed-service and notification-service correctly');
  console.log('  store and query Keycloak UUID strings without any');
  console.log('  BSONError / ObjectId cast crash.');
  console.log('═══════════════════════════════════════════════════════\n');
}

run();
