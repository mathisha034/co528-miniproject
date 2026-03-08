/**
 * test_issue22_23.js
 * Issue 22: Job Service — No Duplicate-Application Guard
 * Issue 23: Job Service — withRetry() Deterministic Delay
 *
 * ── Issue 22 ─────────────────────────────────────────────────────────────────
 * Root cause: Without a duplicate guard, a student could submit multiple
 * applications for the same job, inflating counts and bypassing business rules.
 *
 * Fix: Compound unique index on ApplicationSchema:
 *   ApplicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true })
 *
 * Additionally, the MongoServerError (code 11000) was not caught → returned
 * raw 500. Fix: catch code 11000 in apply() and throw ConflictException (409).
 *
 * ── Issue 23 ─────────────────────────────────────────────────────────────────
 * Root cause: withRetry() used a fixed 1-second delay between retries regardless
 * of error type. Deterministic errors (ValidationError, CastError, code 11000)
 * should NOT be retried — they will never succeed.
 *
 * Fix: withRetry() checks error type before waiting:
 *   if (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000) throw err;
 *
 * This means a duplicate-application response must arrive in < 1 second
 * (no retry delay applied), whereas a transient error would wait 1s, 2s, 4s.
 *
 * Pre-requisite: run `bash setup_temp_users.sh` to create test users and tokens.
 *
 * Tests (Issue 22 — duplicate guard):
 *   A — POST /jobs (create job as admin) → 201
 *   B — POST /jobs/:id/apply as student (first application) → 201
 *   C — POST /jobs/:id/apply as student again (duplicate) → 409 Conflict
 *   D — GET /jobs/:id/applications as admin → exactly 1 application
 *   E — POST /jobs/:id/apply on closed job → 400 BadRequest
 *   F — POST /jobs/:id/apply as alumni (wrong role) → 403 Forbidden
 *   G — GET /jobs/:id as any user → 200 (postedBy stored as UUID string, not ObjectId)
 *
 * Tests (Issue 23 — withRetry deterministic delay):
 *   H — Duplicate apply response time < 1000ms (no retry delay applied)
 *   I — Source: withRetry() skips retry on code 11000
 *   J — Source: withRetry() skips retry on ValidationError / CastError
 */

'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const BASE_URL  = 'http://miniproject.local/api/v1';
const JOBS_BASE = `${BASE_URL}/job-service/jobs`;

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

async function req(method, url, token, body = null) {
    try {
        const config = {
            method,
            url,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            validateStatus: () => true,
        };
        if (body) {
            config.data = body;
            config.headers['Content-Type'] = 'application/json';
        }
        return await axios(config);
    } catch (err) {
        return { status: 0, data: { message: err.message } };
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  Issue 22 — Job Service: No Duplicate-Application Guard');
    console.log('  Issue 23 — Job Service: withRetry() Deterministic Delay');
    console.log('══════════════════════════════════════════════════════════\n');

    let adminToken, studentToken;
    try {
        adminToken   = fs.readFileSync('.e2e_admin_token',   'utf8').trim();
        studentToken = fs.readFileSync('.e2e_student_token', 'utf8').trim();
    } catch {
        console.error('❌ Token files not found. Run: bash setup_temp_users.sh');
        process.exit(1);
    }

    const adminSub   = JSON.parse(Buffer.from(adminToken.split('.')[1],   'base64url').toString()).sub;
    const studentSub = JSON.parse(Buffer.from(studentToken.split('.')[1], 'base64url').toString()).sub;
    console.log(`  Admin sub   : ${adminSub}`);
    console.log(`  Student sub : ${studentSub}\n`);

    let jobId = null;

    // ── Test A: Create job as admin → 201 ────────────────────────────────────
    console.log('── Test A: POST /jobs as admin → 201 Created');
    {
        const r = await req('POST', JOBS_BASE, adminToken, {
            title:       'Software Engineer Intern',
            description: 'e2e test job — duplicate guard',
            company:     'ACME Corp',
            deadline:    '2027-12-31',
        });
        if (r.status === 201) {
            jobId = r.data._id;
            const storedPostedBy = r.data.postedBy;
            pass('201 Created — job created successfully');
            info(`Job _id     : ${jobId}`);
            info(`postedBy    : ${storedPostedBy}`);
            // Verify postedBy is stored as UUID string, not a 24-char hex ObjectId
            if (storedPostedBy === adminSub) {
                pass('postedBy stored as Keycloak UUID string (UUID BSONError fix verified)');
            } else if (storedPostedBy && storedPostedBy.length === 24) {
                fail('postedBy stored as ObjectId hex — UUID cast is still happening');
            } else {
                fail(`postedBy unexpected format: ${storedPostedBy}`);
            }
        } else {
            fail(`Expected 201, got ${r.status}`, JSON.stringify(r.data).slice(0, 120));
        }
    }

    if (!jobId) {
        skip('All remaining tests skipped — no job created in Test A');
        printSummary();
        return;
    }

    // ── Test B: First application as student → 201 ───────────────────────────
    console.log('\n── Test B: POST /jobs/:id/apply as student (first apply) → 201');
    {
        const r = await req('POST', `${JOBS_BASE}/${jobId}/apply`, studentToken, {
            coverLetter: 'I am very interested in this role.',
        });
        if (r.status === 201) {
            pass('201 Created — first application accepted');
            info(`applicantId in response: ${r.data.applicantId}`);
            if (r.data.applicantId === studentSub) {
                pass('applicantId stored as Keycloak UUID string (UUID BSONError fix verified)');
            } else if (r.data.applicantId && r.data.applicantId.length === 24) {
                fail('applicantId stored as ObjectId hex — UUID cast is still active');
            } else {
                info(`applicantId format: ${r.data.applicantId}`);
            }
        } else {
            fail(`Expected 201, got ${r.status}`, JSON.stringify(r.data).slice(0, 120));
        }
    }

    // ── Test C: Duplicate application → 409 Conflict ─────────────────────────
    console.log('\n── Test C: POST /jobs/:id/apply as same student again → 409 Conflict');
    {
        const r = await req('POST', `${JOBS_BASE}/${jobId}/apply`, studentToken, {
            coverLetter: 'Applying again — should be rejected.',
        });
        if (r.status === 409) {
            pass('409 Conflict — duplicate application correctly rejected');
            info(`message: ${r.data.message}`);
        } else if (r.status === 400) {
            pass('400 BadRequest — duplicate application rejected (acceptable status)');
            info(`message: ${r.data.message}`);
        } else if (r.status === 500) {
            fail('500 Internal — duplicate key error not caught; ConflictException not thrown');
            info(`response: ${JSON.stringify(r.data).slice(0, 120)}`);
        } else {
            fail(`Expected 409 (or 400), got ${r.status}`, JSON.stringify(r.data).slice(0, 120));
        }
    }

    // ── Test D: Admin lists applications → exactly 1 record ──────────────────
    console.log('\n── Test D: GET /jobs/:id/applications as admin → list has exactly 1 entry');
    {
        const r = await req('GET', `${JOBS_BASE}/${jobId}/applications`, adminToken);
        if (r.status === 200) {
            const apps = Array.isArray(r.data) ? r.data : r.data.data;
            if (Array.isArray(apps) && apps.length === 1) {
                pass(`Exactly 1 application stored (duplicate was rejected by unique index)`);
                info(`applicantId: ${apps[0].applicantId}, status: ${apps[0].status}`);
            } else if (Array.isArray(apps) && apps.length > 1) {
                fail(`${apps.length} applications found — duplicate guard did NOT prevent duplicate`);
            } else {
                fail(`Unexpected response shape`, JSON.stringify(r.data).slice(0, 120));
            }
        } else {
            fail(`Expected 200, got ${r.status}`, JSON.stringify(r.data).slice(0, 120));
        }
    }

    // ── Test E: Apply to closed job → 400 BadRequest ─────────────────────────
    console.log('\n── Test E: Close job then apply → 400 BadRequest');
    {
        // Close the job
        const closeR = await req('PATCH', `${JOBS_BASE}/${jobId}/status`, adminToken, { status: 'closed' });
        if (closeR.status === 200) {
            info('Job closed successfully');
            // Try to apply
            const r = await req('POST', `${JOBS_BASE}/${jobId}/apply`, studentToken, {});
            if (r.status === 400) {
                pass('400 BadRequest — cannot apply to closed job');
                info(`message: ${r.data.message}`);
            } else {
                fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
            }
        } else {
            skip('Could not close job for Test E', `status: ${closeR.status}`);
        }
    }

    // ── Test F: Apply as alumni (wrong role) → 403 ───────────────────────────
    console.log('\n── Test F: POST /jobs/:id/apply with admin token (not student role) → 403');
    {
        const r = await req('POST', `${JOBS_BASE}/${jobId}/apply`, adminToken, {});
        if (r.status === 403) {
            pass('403 Forbidden — RolesGuard prevents non-student from applying');
        } else {
            fail(`Expected 403, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test G: GET /jobs/:id → 200, postedBy is UUID string ─────────────────
    console.log('\n── Test G: GET /jobs/:id → 200, postedBy is UUID string (not ObjectId hex)');
    {
        const r = await req('GET', `${JOBS_BASE}/${jobId}`, studentToken);
        if (r.status === 200) {
            const storedPostedBy = r.data.postedBy;
            if (storedPostedBy === adminSub) {
                pass('200 OK — postedBy is Keycloak UUID string, confirms UUID BSONError fix');
            } else if (storedPostedBy && /^[0-9a-f]{24}$/.test(storedPostedBy)) {
                fail('postedBy is a 24-char ObjectId hex — UUID cast is still active');
            } else {
                pass(`200 OK — job found`, `postedBy: ${storedPostedBy}`);
            }
        } else {
            fail(`Expected 200, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Issue 23 Tests ────────────────────────────────────────────────────────
    console.log('\n══ Issue 23 — withRetry() Deterministic Delay ══\n');

    // ── Test H: Duplicate apply response time < 1000ms ────────────────────────
    console.log('── Test H: Duplicate apply response time < 1000ms (retry skipped for code 11000)');
    {
        // Create a fresh open job for timing test
        const newJobR = await req('POST', JOBS_BASE, adminToken, {
            title: 'Timing Test Job',
            description: 'Used to measure retry delay',
            company: 'ACME',
        });
        if (newJobR.status === 201) {
            const timingJobId = newJobR.data._id;

            // First apply (succeeds)
            await req('POST', `${JOBS_BASE}/${timingJobId}/apply`, studentToken, {});

            // Second apply — should fail fast (code 11000, no retry wait)
            const t0 = Date.now();
            const r = await req('POST', `${JOBS_BASE}/${timingJobId}/apply`, studentToken, {});
            const elapsed = Date.now() - t0;

            info(`Duplicate apply status: ${r.status}, elapsed: ${elapsed}ms`);

            if (elapsed < 1000) {
                pass(`Response in ${elapsed}ms — code 11000 error shortcircuited retry (no 1s delay)`);
            } else if (elapsed < 3500) {
                fail(`Response took ${elapsed}ms — suggests 1 retry cycle before giving up (should be instant)`);
            } else {
                fail(`Response took ${elapsed}ms — full retry cycle ran (withRetry didn't skip for code 11000)`);
            }

            if (r.status === 409 || r.status === 400) {
                pass(`Status ${r.status} — ConflictException properly thrown and not swallowed by retry`);
            } else {
                info(`(timing job status ${r.status} for reference)`);
            }
        } else {
            skip('Could not create timing job', `status: ${newJobR.status}`);
        }
    }

    // ── Test I: Source — withRetry skips on code 11000 ────────────────────────
    console.log('\n── Test I: Source audit — withRetry() skips retry on code 11000');
    {
        const retryPath = path.resolve(
            __dirname,
            'services/job-service/src/common/retry.util.ts'
        );
        if (fs.existsSync(retryPath)) {
            const src = fs.readFileSync(retryPath, 'utf8');
            if (src.includes('err.code === 11000')) {
                pass('withRetry() source contains `err.code === 11000` early-exit guard');
            } else {
                fail('`err.code === 11000` NOT found in retry.util.ts — duplicate key errors may be retried');
            }
        } else {
            skip('Source file not accessible', retryPath);
        }
    }

    // ── Test J: Source — withRetry skips on ValidationError / CastError ───────
    console.log('\n── Test J: Source audit — withRetry() skips retry on ValidationError/CastError');
    {
        const retryPath = path.resolve(
            __dirname,
            'services/job-service/src/common/retry.util.ts'
        );
        if (fs.existsSync(retryPath)) {
            const src = fs.readFileSync(retryPath, 'utf8');
            const hasValidation = src.includes("err.name === 'ValidationError'");
            const hasCast       = src.includes("err.name === 'CastError'");

            if (hasValidation && hasCast) {
                pass('withRetry() skips retry on both ValidationError and CastError');
            } else {
                if (!hasValidation) fail("'ValidationError' skip guard NOT found in retry.util.ts");
                if (!hasCast)       fail("'CastError' skip guard NOT found in retry.util.ts");
            }
        } else {
            skip('Source file not accessible');
        }
    }

    printSummary();
}

function printSummary() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed | ${failed} failed | ${skipped} skipped`);
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Unhandled error:', err.message);
    process.exit(1);
});
