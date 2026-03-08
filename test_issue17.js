/**
 * test_issue17.js
 * Issue 17: User Service — findById(id) raw string mapping error (CastError → 500)
 *
 * Root cause: Mongoose's findById() throws a CastError (500) when given a non-hex
 * string because it tries to cast the value to ObjectId before querying.
 *
 * Fix: Guard with Types.ObjectId.isValid(id) before calling findById().
 *   - Invalid format (UUID, garbage)  → 400 BadRequest  (was: 500 CastError)
 *   - Valid format but not in DB      → 404 NotFoundException (was: 500 CastError)
 *   - Valid format, existing document → 200 OK (happy path)
 *
 * Pre-requisite: run `bash setup_temp_users.sh` to create test users and write tokens.
 *
 * Tests:
 *   A — GET /users/:mongo_id  (valid ObjectId, existing user)          → 200 OK
 *   B — GET /users/:keycloak_uuid  (valid UUID, invalid ObjectId)      → 400 BadRequest
 *   C — GET /users/not-an-id  (garbage string)                         → 400 BadRequest
 *   D — GET /users/507f1f77bcf86cd799439011  (valid fmt, non-existent) → 404 Not Found
 *   E — GET /users/:id with student token                              → 403 Forbidden (RBAC)
 */

const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://miniproject.local/api/v1';
const USERS_BASE = `${BASE_URL}/user-service/users`;

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(label, detail = '') {
    console.log(`  ✅ PASS: ${label}${detail ? ' — ' + detail : ''}`);
    passed++;
}

function fail(label, detail = '') {
    console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
}

async function req(method, url, token, body = null) {
    try {
        const config = {
            method,
            url,
            headers: { Authorization: `Bearer ${token}` },
            validateStatus: () => true, // never throw on HTTP error status
        };
        if (body) {
            config.data = body;
            config.headers['Content-Type'] = 'application/json';
        }
        return await axios(config);
    } catch (err) {
        // Network / DNS error — surface as a fake 0-status response
        return { status: 0, data: { message: err.message } };
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  Issue 17 — User Service: findById() CastError → 500');
    console.log('══════════════════════════════════════════════════════════\n');

    // Read tokens written by setup_temp_users.sh
    let adminToken, studentToken;
    try {
        adminToken  = fs.readFileSync('.e2e_admin_token',   'utf8').trim();
        studentToken = fs.readFileSync('.e2e_student_token', 'utf8').trim();
    } catch (err) {
        console.error('❌ Token files not found. Run: bash setup_temp_users.sh');
        process.exit(1);
    }

    // Decode tokens to show sub values
    const adminClaims   = JSON.parse(Buffer.from(adminToken.split('.')[1],   'base64url').toString());
    const studentClaims = JSON.parse(Buffer.from(studentToken.split('.')[1], 'base64url').toString());
    console.log(`  Admin sub    : ${adminClaims.sub}`);
    console.log(`  Student sub  : ${studentClaims.sub}\n`);

    // ── Pre-flight: get admin's MongoDB _id via GET /me ──────────────────────
    console.log('[ Pre-flight ] GET /users/me as admin → resolve MongoDB _id');
    const meRes = await req('GET', `${USERS_BASE}/me`, adminToken);
    if (meRes.status !== 200) {
        console.error(`  ❌ Pre-flight failed — could not resolve admin MongoDB _id (status: ${meRes.status})`);
        console.error(`  Response: ${JSON.stringify(meRes.data)}`);
        process.exit(1);
    }
    const adminMongoId = meRes.data._id;
    const adminKeycloakId = meRes.data.keycloakId;
    console.log(`  Admin MongoDB _id  : ${adminMongoId}`);
    console.log(`  Admin keycloakId   : ${adminKeycloakId}\n`);

    if (!adminMongoId || adminMongoId.length !== 24) {
        console.error('  ❌ Pre-flight: _id is not a valid 24-char ObjectId — something is wrong with the User Service response');
        process.exit(1);
    }

    // ── Test A: Valid MongoDB ObjectId, existing user → 200 ──────────────────
    console.log(`[ Test A ] GET /users/${adminMongoId}  (valid ObjectId, existing user → 200)`);
    const resA = await req('GET', `${USERS_BASE}/${adminMongoId}`, adminToken);
    if (resA.status === 200) {
        pass(`Status 200 OK — document returned for valid ObjectId`);
        if (resA.data._id === adminMongoId || String(resA.data._id) === adminMongoId) {
            pass(`Returned document _id matches the requested ObjectId`);
        } else {
            fail(`Returned _id mismatch`, `expected ${adminMongoId}, got ${resA.data._id}`);
        }
        if (resA.data.keycloakId === adminKeycloakId) {
            pass(`keycloakId preserved in document`);
        } else {
            fail(`keycloakId mismatch`, `expected ${adminKeycloakId}, got ${resA.data.keycloakId}`);
        }
    } else {
        fail(`Expected 200, got ${resA.status}`, JSON.stringify(resA.data));
    }

    // ── Test B: Keycloak UUID (valid UUID, but not a valid MongoDB ObjectId) → 400 ─
    console.log(`\n[ Test B ] GET /users/${adminKeycloakId}  (Keycloak UUID → 400, not 500)`);
    const resB = await req('GET', `${USERS_BASE}/${adminKeycloakId}`, adminToken);
    if (resB.status === 400) {
        pass(`Status 400 BadRequest — CastError avoided (UUID correctly rejected)`);
        pass(`No unhandled 500 Internal Server Error`)
    } else if (resB.status === 500) {
        fail(`Got 500 — Mongoose CastError NOT caught`, `UUID passed raw to findById() causing BSONError`);
    } else {
        fail(`Expected 400, got ${resB.status}`, JSON.stringify(resB.data));
    }

    // ── Test C: Garbage string → 400 ─────────────────────────────────────────
    console.log(`\n[ Test C ] GET /users/not-an-id  (garbage string → 400, not 500)`);
    const resC = await req('GET', `${USERS_BASE}/not-an-id`, adminToken);
    if (resC.status === 400) {
        pass(`Status 400 BadRequest — garbage string rejected cleanly`);
        pass(`No unhandled 500 Internal Server Error`);
    } else if (resC.status === 500) {
        fail(`Got 500 — Mongoose CastError NOT caught`, `garbage string passed raw to findById()`);
    } else {
        fail(`Expected 400, got ${resC.status}`, JSON.stringify(resC.data));
    }

    // ── Test D: Valid ObjectId format, not in DB → 404 ───────────────────────
    const nonExistentId = '507f1f77bcf86cd799439011';
    console.log(`\n[ Test D ] GET /users/${nonExistentId}  (valid ObjectId format, non-existent → 404)`);
    const resD = await req('GET', `${USERS_BASE}/${nonExistentId}`, adminToken);
    if (resD.status === 404) {
        pass(`Status 404 NotFoundException — valid format, user not found, clean 404`);
        pass(`No unhandled 500 CastError`);
    } else if (resD.status === 500) {
        fail(`Got 500 — unexpected error on valid ObjectId format`, JSON.stringify(resD.data));
    } else {
        fail(`Expected 404, got ${resD.status}`, JSON.stringify(resD.data));
    }

    // ── Test E: Student token → 403 (RBAC) ───────────────────────────────────
    console.log(`\n[ Test E ] GET /users/${adminMongoId} with student token → 403 (RBAC enforced)`);
    const resE = await req('GET', `${USERS_BASE}/${adminMongoId}`, studentToken);
    if (resE.status === 403) {
        pass(`Status 403 Forbidden — RolesGuard(admin) correctly blocks student access`);
    } else if (resE.status === 200) {
        fail(`Got 200 — student should NOT have access to GET /users/:id`, `RolesGuard not enforced`);
    } else {
        fail(`Expected 403, got ${resE.status}`, JSON.stringify(resE.data));
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(58));
    console.log(`  Issue 17 Results: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
        console.log('  ✅ ISSUE 17 RESOLVED — findById() CastError is fully guarded.');
        console.log('     Invalid IDs return 400/404 rather than 500.');
    } else {
        console.log('  ❌ ISSUE 17 STILL HAS FAILURES — see details above.');
    }
    console.log('═'.repeat(58) + '\n');
    process.exit(failed > 0 ? 1 : 0);
}

run();
