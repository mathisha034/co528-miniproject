/**
 * test_s7_gaps.js  —  Unit tests for S7 gap implementations
 *
 * Tests both S7 gaps in isolation:
 *   G7.1: GET /analytics/overview response includes scenario-specified named keys:
 *         totalUsers, openJobs, activeResearch  (in addition to existing keys)
 *   G7.2: GET /analytics/overview is admin-only (RolesGuard 'admin')
 *         Non-admins (student, alumni) receive 403 Forbidden
 *
 * This is a STANDALONE test — it does NOT modify test_s7.js.
 * Run individually:  node tests/e2e/test_s7_gaps.js
 *
 * Prerequisites: setup_personas.sh must have been run.
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, svcUrl,
} = require('./shared');

async function main() {
    banner('S7-GAPS — Analytics Service: extended overview fields & admin-only RBAC');

    // ──────────────────────────────────────────────────────────────────────────
    section('Setup — Load tokens');
    // ──────────────────────────────────────────────────────────────────────────
    const adminToken   = loadToken('.e2e_admin_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const studentToken = loadToken('.e2e_student_token');

    // ──────────────────────────────────────────────────────────────────────────
    section('G7.1 — Overview response includes totalUsers, openJobs, activeResearch');
    // ──────────────────────────────────────────────────────────────────────────

    const overviewRes = await req(
        svcUrl('analytics', 'analytics/overview'), 'GET', null, adminToken);

    assert('G7.1.1 Admin: GET /analytics/overview → 200',
        overviewRes.status === 200,
        `HTTP ${overviewRes.status}: ${JSON.stringify(overviewRes.body)}`);

    console.log(`  ▸ overview body: ${JSON.stringify(overviewRes.body)}`);

    // Existing keys still present (backward compat)
    assert('G7.1.2 Response still has "users" key (backward compat)',
        overviewRes.body?.users !== undefined,
        `body=${JSON.stringify(overviewRes.body)}`);

    assert('G7.1.3 Response still has "posts" key (backward compat)',
        overviewRes.body?.posts !== undefined,
        `body=${JSON.stringify(overviewRes.body)}`);

    assert('G7.1.4 Response still has "jobs" key (backward compat)',
        overviewRes.body?.jobs !== undefined,
        `body=${JSON.stringify(overviewRes.body)}`);

    assert('G7.1.5 Response still has "events" key (backward compat)',
        overviewRes.body?.events !== undefined,
        `body=${JSON.stringify(overviewRes.body)}`);

    // New scenario-specified keys
    assert('G7.1.6 Response has "totalUsers" key (G7.1)',
        overviewRes.body?.totalUsers !== undefined,
        `missing totalUsers — body=${JSON.stringify(overviewRes.body)}`);

    assert('G7.1.7 Response has "openJobs" key (G7.1)',
        overviewRes.body?.openJobs !== undefined,
        `missing openJobs — body=${JSON.stringify(overviewRes.body)}`);

    assert('G7.1.8 Response has "activeResearch" key (G7.1)',
        overviewRes.body?.activeResearch !== undefined,
        `missing activeResearch — body=${JSON.stringify(overviewRes.body)}`);

    // Check types and values
    assert('G7.1.9 totalUsers is a non-negative number',
        typeof overviewRes.body?.totalUsers === 'number' && overviewRes.body.totalUsers >= 0,
        `totalUsers=${overviewRes.body?.totalUsers}`);

    assert('G7.1.10 totalUsers === users (same count)',
        overviewRes.body?.totalUsers === overviewRes.body?.users,
        `totalUsers=${overviewRes.body?.totalUsers} users=${overviewRes.body?.users}`);

    assert('G7.1.11 openJobs is a non-negative number',
        typeof overviewRes.body?.openJobs === 'number' && overviewRes.body.openJobs >= 0,
        `openJobs=${overviewRes.body?.openJobs}`);

    assert('G7.1.12 openJobs ≤ jobs (open jobs cannot exceed total jobs)',
        overviewRes.body?.openJobs <= overviewRes.body?.jobs,
        `openJobs=${overviewRes.body?.openJobs} jobs=${overviewRes.body?.jobs}`);

    assert('G7.1.13 activeResearch is a non-negative number',
        typeof overviewRes.body?.activeResearch === 'number' && overviewRes.body.activeResearch >= 0,
        `activeResearch=${overviewRes.body?.activeResearch}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('G7.2 — GET /analytics/overview is admin-only (RolesGuard)');
    // ──────────────────────────────────────────────────────────────────────────

    // Student should be denied
    const studentOverviewRes = await req(
        svcUrl('analytics', 'analytics/overview'), 'GET', null, studentToken);
    assert('G7.2.1 Student: GET /analytics/overview → 403 Forbidden (G7.2)',
        studentOverviewRes.status === 403,
        `HTTP ${studentOverviewRes.status}: ${JSON.stringify(studentOverviewRes.body)}`);

    // Alumni should be denied
    const alumniOverviewRes = await req(
        svcUrl('analytics', 'analytics/overview'), 'GET', null, alumniToken);
    assert('G7.2.2 Alumni: GET /analytics/overview → 403 Forbidden (G7.2)',
        alumniOverviewRes.status === 403,
        `HTTP ${alumniOverviewRes.status}: ${JSON.stringify(alumniOverviewRes.body)}`);

    // Unauthenticated should be 401 (JwtAuthGuard fires before RolesGuard)
    const unauthOverviewRes = await req(
        svcUrl('analytics', 'analytics/overview'), 'GET', null, null);
    assert('G7.2.3 Unauthenticated: GET /analytics/overview → 401',
        unauthOverviewRes.status === 401,
        `HTTP ${unauthOverviewRes.status}`);

    // Admin can still access
    const adminOverview2 = await req(
        svcUrl('analytics', 'analytics/overview'), 'GET', null, adminToken);
    assert('G7.2.4 Admin: GET /analytics/overview → 200 (admin still authorized)',
        adminOverview2.status === 200,
        `HTTP ${adminOverview2.status}`);

    // Other analytics endpoints remain open to all authenticated users
    const studentPostsRes = await req(
        svcUrl('analytics', 'analytics/posts'), 'GET', null, studentToken);
    assert('G7.2.5 Student: GET /analytics/posts → 200 (drill-downs still open)',
        studentPostsRes.status === 200,
        `HTTP ${studentPostsRes.status}`);

    const alumniJobsRes = await req(
        svcUrl('analytics', 'analytics/jobs'), 'GET', null, alumniToken);
    assert('G7.2.6 Alumni: GET /analytics/jobs → 200 (drill-downs still open)',
        alumniJobsRes.status === 200,
        `HTTP ${alumniJobsRes.status}`);

    const studentUsersRes = await req(
        svcUrl('analytics', 'analytics/users'), 'GET', null, studentToken);
    assert('G7.2.7 Student: GET /analytics/users → 200 (drill-downs still open)',
        studentUsersRes.status === 200,
        `HTTP ${studentUsersRes.status}`);

    // Latencies endpoint remains admin-only (was already constrained)
    const studentLatencyRes = await req(
        svcUrl('analytics', 'analytics/latencies'), 'GET', null, studentToken);
    assert('G7.2.8 Student: GET /analytics/latencies → 403 (admin-only unchanged)',
        studentLatencyRes.status === 403,
        `HTTP ${studentLatencyRes.status}`);

    summary('S7-GAPS — Analytics Service Gap Implementations (G7.1–G7.2)');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
