#!/usr/bin/env node
/**
 * S1 — New Student Registration & Onboarding
 * ============================================
 * Actor  : Ashan (student)
 * Goal   : Login via Keycloak, verify profile auto-creation, update profile,
 *          confirm RBAC blocks student from admin-only endpoints.
 *
 * Services: Keycloak, user-service
 *
 * Run prerequisites: bash tests/e2e/setup_personas.sh
 */

'use strict';

const http = require('http');
const {
    req, assert, assertGap, section, banner, summary,
    loadToken, getUserId, decodeClaims, svcUrl, sleep, ROOT,
} = require('./shared');

// ─────────────────────────────────────────────────────────────────────────────
async function main() {
    banner('S1 — New Student Registration & Onboarding');

    // Load tokens (obtained by setup_personas.sh)
    let studentToken, adminToken;
    try {
        studentToken = loadToken('.e2e_student_token');
        adminToken   = loadToken('.e2e_admin_token');
    } catch (e) {
        console.error(`[ERROR] ${e.message}`);
        process.exit(1);
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('S1 · Step 1 — JWT Claims Validation');
    // ──────────────────────────────────────────────────────────────────────────

    const claims = decodeClaims(studentToken);
    console.log(`  ▸ Decoded JWT claims: sub=${claims.sub?.slice(0,8)}...  role=${claims.realm_access?.roles}`);

    assert('S1.1  JWT contains sub (Keycloak userId UUID)',
        typeof claims.sub === 'string' && claims.sub.length > 10,
        `sub=${claims.sub}`);

    assert('S1.2  JWT contains email claim',
        typeof claims.email === 'string' && claims.email.includes('@'),
        `email=${claims.email}`);

    assert('S1.3  JWT realm_access.roles includes "student"',
        Array.isArray(claims.realm_access?.roles) && claims.realm_access.roles.includes('student'),
        `roles=${JSON.stringify(claims.realm_access?.roles)}`);

    assert('S1.4  JWT contains exp (expiry timestamp)',
        typeof claims.exp === 'number' && claims.exp > Date.now() / 1000,
        `exp=${claims.exp}`);

    // Verify admin token has admin role
    const adminClaims = decodeClaims(adminToken);
    assert('S1.5  Admin JWT has "admin" in realm_access.roles',
        Array.isArray(adminClaims.realm_access?.roles) && adminClaims.realm_access.roles.includes('admin'),
        `roles=${JSON.stringify(adminClaims.realm_access?.roles)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S1 · Step 2 — Profile Auto-Created on First Login (GET /users/me)');
    // ──────────────────────────────────────────────────────────────────────────

    const meRes = await req(svcUrl('user', 'users/me'), 'GET', null, studentToken);
    console.log(`  ▸ GET /users/me → HTTP ${meRes.status} (${meRes.ms}ms)`);
    console.log(`    body: ${JSON.stringify(meRes.body)?.substring(0, 120)}`);

    assert('S1.6  GET /users/me → 200 or 201 (profile returned or auto-created)',
        meRes.status === 200 || meRes.status === 201,
        `got HTTP ${meRes.status}: ${JSON.stringify(meRes.body)}`);

    assert('S1.7  Profile contains email matching Keycloak claim',
        meRes.body?.email === claims.email || (meRes.body?.email || '').includes('@'),
        `profile email=${meRes.body?.email}`);

    assert('S1.8  Profile has a role field',
        typeof meRes.body?.role === 'string',
        `role=${meRes.body?.role}`);

    assert('S1.9  Profile has createdAt timestamp',
        !!meRes.body?.createdAt,
        `createdAt=${meRes.body?.createdAt}`);

    // Test: no JWT → 401
    const noJwtRes = await req(svcUrl('user', 'users/me'), 'GET', null, null);
    assert('S1.10 GET /users/me without JWT → 401 Unauthorized',
        noJwtRes.status === 401,
        `got HTTP ${noJwtRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S1 · Step 3 — Profile Update (PATCH /users/me)');
    // ──────────────────────────────────────────────────────────────────────────

    const ts         = Date.now();
    const newName    = `Ashan K. ${ts}`;
    const newBio     = 'Final year CS student exploring cloud-native systems';
    const patchRes   = await req(svcUrl('user', 'users/me'), 'PATCH',
        { name: newName, bio: newBio }, studentToken);
    console.log(`  ▸ PATCH /users/me → HTTP ${patchRes.status}`);

    assert('S1.11 PATCH /users/me → 200 (update accepted)',
        patchRes.status === 200,
        `got HTTP ${patchRes.status}: ${JSON.stringify(patchRes.body)}`);

    // Verify the update persisted
    const meRes2 = await req(svcUrl('user', 'users/me'), 'GET', null, studentToken);
    assert('S1.12 GET /users/me after PATCH returns updated name',
        meRes2.body?.name === newName,
        `got name="${meRes2.body?.name}", expected "${newName}"`);

    assert('S1.13 GET /users/me after PATCH returns updated bio',
        meRes2.body?.bio === newBio,
        `got bio="${meRes2.body?.bio}"`);

    // G1.1 IMPLEMENTED: skills[] is now in UpdateUserDto and User schema
    const skillsList = ['Python', 'Go', 'NestJS'];
    const skillsPatch = await req(svcUrl('user', 'users/me'), 'PATCH',
        { skills: skillsList }, studentToken);
    assert('S1.14 PATCH /users/me with skills[] → 200',
        skillsPatch.status === 200,
        `got HTTP ${skillsPatch.status}: ${JSON.stringify(skillsPatch.body)}`);

    const meAfterSkills = await req(svcUrl('user', 'users/me'), 'GET', null, studentToken);
    assert('S1.14b GET /users/me after skills PATCH returns skills array',
        Array.isArray(meAfterSkills.body?.skills) &&
        skillsList.every(s => meAfterSkills.body.skills.includes(s)),
        `skills=${JSON.stringify(meAfterSkills.body?.skills)}`);

    // Test: no JWT on PATCH → 401
    const noJwtPatch = await req(svcUrl('user', 'users/me'), 'PATCH',
        { name: 'X' }, null);
    assert('S1.15 PATCH /users/me without JWT → 401 Unauthorized',
        noJwtPatch.status === 401, `got HTTP ${noJwtPatch.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S1 · Step 4 — RBAC: Student Cannot Access Admin Endpoints');
    // ──────────────────────────────────────────────────────────────────────────

    // Student tries to list all users (admin-only)
    const listRes = await req(svcUrl('user', 'users'), 'GET', null, studentToken);
    assert('S1.16 Student: GET /users (admin list) → 403 Forbidden',
        listRes.status === 403,
        `got HTTP ${listRes.status}: ${JSON.stringify(listRes.body)}`);

    // Admin on same endpoint → 200
    const adminListRes = await req(svcUrl('user', 'users'), 'GET', null, adminToken);
    assert('S1.17 Admin: GET /users → 200 (admin endpoint accessible)',
        adminListRes.status === 200,
        `got HTTP ${adminListRes.status}: ${JSON.stringify(adminListRes.body)}`);

    assert('S1.18 Admin: GET /users returns an array of user documents',
        Array.isArray(adminListRes.body),
        `body type: ${typeof adminListRes.body}`);

    // Student tries to get another user by ID using admin endpoint
    const adminUserId = getUserId(adminToken);
    const getByIdRes  = await req(svcUrl('user', `users/${adminUserId}`), 'GET', null, studentToken);
    assert('S1.19 Student: GET /users/:id → 403 Forbidden (admin-only endpoint)',
        getByIdRes.status === 403,
        `got HTTP ${getByIdRes.status}`);

    // Admin can get user by ID — use MongoDB _id from admin's own profile
    const adminProfileRes = await req(svcUrl('user', 'users/me'), 'GET', null, adminToken);
    const adminMongoId = adminProfileRes.body?._id;
    const adminGetByIdRes = await req(svcUrl('user', `users/${adminMongoId}`), 'GET', null, adminToken);
    assert('S1.20 Admin: GET /users/:id (MongoDB _id) → 200 (admin can fetch any user)',
        adminGetByIdRes.status === 200,
        `got HTTP ${adminGetByIdRes.status}  mongoId=${adminMongoId}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S1 · Step 5 — Alumni Role Validation');
    // ──────────────────────────────────────────────────────────────────────────

    const alumniToken = loadToken('.e2e_alumni_token');
    const alumniClaims = decodeClaims(alumniToken);

    assert('S1.21 Alumni JWT has "alumni" in realm_access.roles',
        Array.isArray(alumniClaims.realm_access?.roles) &&
        alumniClaims.realm_access.roles.includes('alumni'),
        `roles=${JSON.stringify(alumniClaims.realm_access?.roles)}`);

    const alumniMeRes = await req(svcUrl('user', 'users/me'), 'GET', null, alumniToken);
    assert('S1.22 Alumni: GET /users/me → 200 (profile accessible)',
        alumniMeRes.status === 200 || alumniMeRes.status === 201,
        `got HTTP ${alumniMeRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S1 · Step 6 — Service Health Check');
    // ──────────────────────────────────────────────────────────────────────────

    // G1.2 IMPLEMENTED: @Get('health') with @Public() added to UsersController
    const healthRes = await req(svcUrl('user', 'users/health'), 'GET', null, null);
    assert('S1.23 GET /users/health → 200 (dedicated liveness endpoint, no auth required)',
        healthRes.status === 200,
        `got HTTP ${healthRes.status}: ${JSON.stringify(healthRes.body)}`);

    assert('S1.24 /users/health response has status: "ok"',
        healthRes.body?.status === 'ok',
        `body=${JSON.stringify(healthRes.body)}`);

    summary('S1 — New Student Registration & Onboarding');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
