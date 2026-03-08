/**
 * test_issue28_29.js
 * Issue 28: Notification Service — Silent Null on markRead
 * Issue 29: Notification Service — Inter-Service Authenticative Tokens
 *
 * ── Issue 28 ─────────────────────────────────────────────────────────────────
 * Root cause: markRead() used findOneAndUpdate() with a filter that includes
 * both `_id` and `userId`. If the document does not exist (wrong ID, wrong user
 * — i.e., trying to mark someone else's notification), the method returned `null`
 * silently without throwing — callers received no indication of failure.
 *
 * Fix: Add a null-check after findOneAndUpdate():
 *   if (!updated) throw new NotFoundException('Notification not found or unauthorized')
 *
 * ── Issue 29 ─────────────────────────────────────────────────────────────────
 * Root cause: The internal `/internal/notifications/notify` endpoint had no
 * authentication, allowing any caller to inject notifications directly.
 *
 * Fix: Validate `x-internal-token` header against INTERNAL_TOKEN env var
 * (defaults to `miniproject-internal-auth-token`). Throw UnauthorizedException
 * on mismatch.
 *
 * Pre-requisite: run `bash setup_temp_users.sh` to create test users and tokens.
 *
 * Tests (Issue 28 — markRead null-guard):
 *   A — POST via internal endpoint to create a notification for student → 201
 *   B — PATCH /notifications/:id/read with correct user → 200 notification marked read
 *   C — PATCH /notifications/:id/read with wrong (non-existent) ID → 404 Not Found
 *   D — PATCH /notifications/:id/read on another user's notification → 404 (unauthorized)
 *   E — GET /notifications?unread=true after markRead → notification not in unread list
 *   F — PATCH /notifications/read-all → 200 with modified count
 *
 * Tests (Issue 29 — internal token auth):
 *   G — POST /internal/notifications/notify with valid token → 201 Created
 *   H — POST /internal/notifications/notify with wrong token → 401 Unauthorized
 *   I — POST /internal/notifications/notify with no x-internal-token header → 401
 *   J — POST /internal/notifications/notify with valid token + invalid DTO → 400
 *   K — Source: x-internal-token header extracted and validated against env/default
 *   L — Source: NotFoundException thrown when markRead returns null
 */

'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const BASE_URL   = 'http://miniproject.local/api/v1';
const NOTIF_BASE = `${BASE_URL}/notification-service/notifications`;
const INTERNAL   = `${BASE_URL}/notification-service/internal/notifications/notify`;
const INTERNAL_TOKEN = 'miniproject-internal-auth-token';

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0, failed = 0, skipped = 0;

function pass(label, detail = '') {
    console.log(`  ✅ PASS: ${label}${detail ? ' — ' + detail : ''}`);
    passed++;
}
function fail(label, detail = '') {
    console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
}
function skip(label, detail = '') {
    console.log(`  ⏭  SKIP: ${label}${detail ? ' — ' + detail : ''}`);
    skipped++;
}
function info(msg) {
    console.log(`         ℹ  ${msg}`);
}

async function req(method, url, opts = {}) {
    try {
        const config = {
            method, url,
            headers: { ...opts.headers },
            validateStatus: () => true,
        };
        if (opts.token)  config.headers['Authorization'] = `Bearer ${opts.token}`;
        if (opts.body)  { config.data = opts.body; config.headers['Content-Type'] = 'application/json'; }
        return await axios(config);
    } catch (err) {
        return { status: 0, data: { message: err.message } };
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  Issue 28 — Notification Service: Silent Null on markRead');
    console.log('  Issue 29 — Notification Service: Inter-Service Auth Token');
    console.log('══════════════════════════════════════════════════════════\n');

    let adminToken, studentToken;
    try {
        adminToken   = fs.readFileSync('.e2e_admin_token',   'utf8').trim();
        studentToken = fs.readFileSync('.e2e_student_token', 'utf8').trim();
    } catch {
        console.error('❌ Token files not found. Run: bash setup_temp_users.sh');
        process.exit(1);
    }

    const studentSub = JSON.parse(Buffer.from(studentToken.split('.')[1], 'base64url').toString()).sub;
    const adminSub   = JSON.parse(Buffer.from(adminToken.split('.')[1],   'base64url').toString()).sub;
    console.log(`  Student sub : ${studentSub}`);
    console.log(`  Admin sub   : ${adminSub}\n`);

    let notifId = null;

    // ── Test A: Create notification via internal endpoint → 201 (setup) ───────
    console.log('── Test A: POST /internal/notifications/notify (setup) → create test notification');
    {
        const ikey = `test_issue28_${Date.now()}`;
        const r = await req('POST', INTERNAL, {
            headers: { 'x-internal-token': INTERNAL_TOKEN },
            body: {
                userId:        studentSub,
                type:          'general',
                message:       'Test notification for Issue 28',
                idempotencyKey: ikey,
            },
        });
        if (r.status === 201 || r.status === 200) {
            notifId = r.data._id;
            pass(`${r.status} — notification created via internal endpoint`);
            info(`notificationId: ${notifId}`);
        } else {
            fail(`Expected 201, got ${r.status}`, JSON.stringify(r.data).slice(0, 120));
        }
    }

    if (!notifId) {
        skip('Tests B–F skipped — no notification created in Test A');
    } else {
        // ── Test B: PATCH /notifications/:id/read (correct user) → 200 ────────
        console.log('\n── Test B: PATCH /notifications/:id/read (correct user) → 200 [Issue 28]');
        {
            const r = await req('PATCH', `${NOTIF_BASE}/${notifId}/read`, { token: studentToken });
            if (r.status === 200) {
                pass('200 OK — notification marked as read');
                if (r.data.read === true) {
                    pass('Response body has read: true');
                } else {
                    fail('Response body does not have read: true', JSON.stringify(r.data).slice(0, 80));
                }
                info(`notification: ${JSON.stringify(r.data).slice(0, 80)}`);
            } else {
                fail(`Expected 200, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
            }
        }

        // ── Test C: PATCH /notifications/<non-existent>/read → 404 ────────────
        console.log('\n── Test C: PATCH /notifications/<valid-fmt non-existent>/read → 404 [Issue 28]');
        {
            const r = await req('PATCH', `${NOTIF_BASE}/507f1f77bcf86cd799439011/read`, { token: studentToken });
            if (r.status === 404) {
                pass('404 Not Found — markRead throws NotFoundException on non-existent ID');
                info(`message: ${r.data.message}`);
            } else if (r.status === 200 && r.data === null) {
                fail('Silent null — markRead returned null without throwing (NotFoundException not implemented)');
            } else if (r.status === 200) {
                fail('200 with data — should have been 404 for non-existent notification');
            } else {
                fail(`Expected 404, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
            }
        }

        // ── Test D: Mark another user's notification → 404 (ownership guard) ──
        console.log('\n── Test D: PATCH /notifications/:id/read with admin (not owner) → 404 [Issue 28]');
        {
            // Create a fresh notification for student, try to mark as read with admin token
            const ikey2 = `test_issue28_ownership_${Date.now()}`;
            const createR = await req('POST', INTERNAL, {
                headers: { 'x-internal-token': INTERNAL_TOKEN },
                body: {
                    userId:         studentSub,
                    type:           'general',
                    message:        'Ownership test notification',
                    idempotencyKey: ikey2,
                },
            });
            if (createR.status === 201 || createR.status === 200) {
                const otherNotifId = createR.data._id;
                const r = await req('PATCH', `${NOTIF_BASE}/${otherNotifId}/read`, { token: adminToken });
                if (r.status === 404) {
                    pass('404 — admin cannot mark student notification as read (userId mismatch causes NotFoundException)');
                    info('Ownership boundary enforced by `findOneAndUpdate({ _id, userId })` filter');
                } else if (r.status === 200) {
                    fail('200 — admin was able to mark another user\'s notification as read (ownership not enforced)');
                } else {
                    fail(`Expected 404, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
                }
            } else {
                skip('Could not create target notification', `status: ${createR.status}`);
            }
        }

        // ── Test E: GET /notifications?unread=true → already-read notif absent ─
        console.log('\n── Test E: GET /notifications?unread=true → read notification not in unread list');
        {
            const r = await req('GET', `${NOTIF_BASE}?unread=true`, { token: studentToken });
            if (r.status === 200) {
                const list = Array.isArray(r.data) ? r.data : r.data.data;
                if (Array.isArray(list)) {
                    const found = list.some(n => n._id === notifId);
                    if (!found) {
                        pass('Read notification excluded from unread=true filter');
                    } else {
                        fail('Read notification still appears in unread=true list');
                    }
                    info(`Unread count: ${list.length}`);
                } else {
                    fail('Response is not an array', JSON.stringify(r.data).slice(0, 80));
                }
            } else {
                fail(`Expected 200, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
            }
        }

        // ── Test F: PATCH /notifications/read-all → modified count ────────────
        console.log('\n── Test F: PATCH /notifications/read-all → 200 with modified count');
        {
            const r = await req('PATCH', `${NOTIF_BASE}/read-all`, { token: studentToken });
            if (r.status === 200) {
                pass('200 OK — markAllRead returned successfully');
                if (typeof r.data.modified === 'number') {
                    pass(`modified count: ${r.data.modified}`);
                } else {
                    fail('Response missing `modified` count', JSON.stringify(r.data).slice(0, 80));
                }
            } else {
                fail(`Expected 200, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
            }
        }
    }

    // ── Issue 29 Tests ────────────────────────────────────────────────────────
    console.log('\n══ Issue 29 — Inter-Service Authentication Tokens ══\n');

    // ── Test G: Valid internal token → 201 Created ────────────────────────────
    console.log('── Test G: POST /internal/notifications/notify with valid token → 201 [Issue 29]');
    {
        const ikey = `test_issue29_valid_${Date.now()}`;
        const r = await req('POST', INTERNAL, {
            headers: { 'x-internal-token': INTERNAL_TOKEN },
            body: {
                userId:         adminSub,
                type:           'general',
                message:        'Issue 29 valid token test',
                idempotencyKey: ikey,
            },
        });
        if (r.status === 201 || r.status === 200) {
            pass(`${r.status} — valid internal token accepted; notification created`);
            info(`_id: ${r.data._id}`);
        } else {
            fail(`Expected 201, got ${r.status}`, JSON.stringify(r.data).slice(0, 120));
        }
    }

    // ── Test H: Wrong internal token → 401 ───────────────────────────────────
    console.log('\n── Test H: POST /internal/notifications/notify with wrong token → 401 [Issue 29]');
    {
        const r = await req('POST', INTERNAL, {
            headers: { 'x-internal-token': 'wrong-token-value' },
            body: {
                userId:         adminSub,
                type:           'general',
                message:        'This should be rejected',
                idempotencyKey: `test_issue29_wrong_${Date.now()}`,
            },
        });
        if (r.status === 401) {
            pass('401 Unauthorized — wrong internal token rejected');
            info(`message: ${r.data.message}`);
        } else {
            fail(`Expected 401, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test I: No x-internal-token header → 401 ─────────────────────────────
    console.log('\n── Test I: POST /internal/notifications/notify with no internal token header → 401');
    {
        const r = await req('POST', INTERNAL, {
            body: {
                userId:         adminSub,
                type:           'general',
                message:        'No token provided',
                idempotencyKey: `test_issue29_notoken_${Date.now()}`,
            },
        });
        if (r.status === 401) {
            pass('401 Unauthorized — missing x-internal-token header rejected');
        } else {
            fail(`Expected 401, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test J: Valid token + invalid DTO → 400 (ValidationPipe) ─────────────
    console.log('\n── Test J: POST /internal/notifications/notify valid token + missing userId → 400');
    {
        const r = await req('POST', INTERNAL, {
            headers: { 'x-internal-token': INTERNAL_TOKEN },
            body: {
                // missing userId and other required fields
                type: 'general',
            },
        });
        if (r.status === 400) {
            pass('400 BadRequest — ValidationPipe rejects incomplete DTO even with valid internal token');
        } else {
            fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test K: Source — x-internal-token validation in internal.controller.ts ──
    console.log('\n── Test K: Source — x-internal-token header validated in InternalController [Issue 29]');
    {
        const ctrlPath = path.resolve(
            __dirname,
            'services/notification-service/src/notifications/internal.controller.ts'
        );
        if (fs.existsSync(ctrlPath)) {
            const src = fs.readFileSync(ctrlPath, 'utf8');
            if (src.includes('x-internal-token')) {
                pass('Controller reads `x-internal-token` header');
            } else {
                fail('`x-internal-token` header NOT found in InternalController source');
            }
            if (src.includes('UnauthorizedException')) {
                pass('UnauthorizedException thrown on invalid token');
            } else {
                fail('UnauthorizedException not thrown — token mismatch may silently pass');
            }
            if (src.includes("INTERNAL_TOKEN") || src.includes("miniproject-internal-auth-token")) {
                pass('Token compared against INTERNAL_TOKEN env var or default value');
            } else {
                fail('No reference to expected token value found');
            }
        } else {
            skip('Source file not accessible', ctrlPath);
        }
    }

    // ── Test L: Source — NotFoundException on null in markRead [Issue 28] ────
    console.log('\n── Test L: Source — NotFoundException thrown when markRead returns null [Issue 28]');
    {
        const svcPath = path.resolve(
            __dirname,
            'services/notification-service/src/notifications/notifications.service.ts'
        );
        if (fs.existsSync(svcPath)) {
            const src = fs.readFileSync(svcPath, 'utf8');
            if (src.includes('NotFoundException') && src.includes('if (!updated)')) {
                pass('markRead() has `if (!updated) throw new NotFoundException(...)` guard');
            } else if (!src.includes('if (!updated)')) {
                fail('Null check `if (!updated)` NOT found in markRead()');
            } else if (!src.includes('NotFoundException')) {
                fail('NotFoundException import NOT found — null handled silently');
            }
        } else {
            skip('Source file not accessible', svcPath);
        }
    }

    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed | ${failed} failed | ${skipped} skipped`);
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Unhandled error:', err.message);
    process.exit(1);
});
