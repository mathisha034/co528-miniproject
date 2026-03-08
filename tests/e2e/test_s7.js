#!/usr/bin/env node
/**
 * S7 — Admin Reviews Analytics Dashboard
 * ========================================
 * Actor  : Dr. Rajapaksha (admin) inspects platform-level statistics.
 *          Nimali (alumni) and Ashan (student) verify they CANNOT access
 *          latency data but CAN access general analytics.
 *
 * Services: analytics-service
 *
 * Key facts:
 *  - GET /analytics/overview   → admin-only (RolesGuard 'admin') [G7.2 implemented]
 *  - GET /analytics/posts      → ALL authenticated users
 *  - GET /analytics/jobs       → ALL authenticated users
 *  - GET /analytics/users      → ALL authenticated users
 *  - GET /analytics/latencies  → admin-only (RolesGuard 'admin')
 *  - Response shape from overview: { users, posts, jobs, events,
 *                                    totalUsers, openJobs, activeResearch } [G7.1 implemented]
 *
 * Run: node tests/e2e/test_s7.js
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, svcUrl,
} = require('./shared');

async function main() {
    banner('S7 — Admin Reviews Analytics Dashboard');

    const adminToken   = loadToken('.e2e_admin_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const studentToken = loadToken('.e2e_student_token');

    // ──────────────────────────────────────────────────────────────────────────
    section('S7 · Step 1 — GET /analytics/overview');
    // ──────────────────────────────────────────────────────────────────────────

    const overviewRes = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, adminToken);
    console.log(`  ▸ GET /analytics/overview → HTTP ${overviewRes.status}: ${JSON.stringify(overviewRes.body)}`);

    assert('S7.1  Admin: GET /analytics/overview → 200',
        overviewRes.status === 200,
        `got HTTP ${overviewRes.status}: ${JSON.stringify(overviewRes.body)}`);

    // Response shape: { users, posts, jobs, events }
    const hasUsers  = overviewRes.body?.users  !== undefined;
    const hasPosts  = overviewRes.body?.posts  !== undefined;
    const hasJobs   = overviewRes.body?.jobs   !== undefined;
    const hasEvents = overviewRes.body?.events !== undefined;

    assert('S7.2  Overview body contains { users, posts, jobs, events }',
        hasUsers && hasPosts && hasJobs && hasEvents,
        `body=${JSON.stringify(overviewRes.body)}`);

    assert('S7.3  users count ≥ 0 and is a number',
        typeof overviewRes.body?.users === 'number' && overviewRes.body.users >= 0,
        `users=${overviewRes.body?.users}`);

    // G7.1: overview now also includes totalUsers, openJobs, activeResearch
    assert('S7.4  Response contains "totalUsers", "openJobs", "activeResearch" keys (G7.1)',
        overviewRes.body?.totalUsers !== undefined &&
        overviewRes.body?.openJobs   !== undefined &&
        overviewRes.body?.activeResearch !== undefined,
        `body=${JSON.stringify(overviewRes.body)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S7 · Step 2 — Overview is admin-only (G7.2)');
    // ──────────────────────────────────────────────────────────────────────────

    // G7.2: RolesGuard added — non-admins are now rejected with 403
    const studentOverviewRes = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, studentToken);
    assert('S7.5  Student: GET /analytics/overview → 403 Forbidden (admin-only, G7.2)',
        studentOverviewRes.status === 403,
        `got HTTP ${studentOverviewRes.status}`);

    const alumniOverviewRes = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, alumniToken);
    assert('S7.6  Alumni: GET /analytics/overview → 403 Forbidden (admin-only, G7.2)',
        alumniOverviewRes.status === 403,
        `got HTTP ${alumniOverviewRes.status}`);

    // Confirm the constraint: both non-admin roles blocked
    assert('S7.7  GET /analytics/overview is admin-only — non-admins get 403 (G7.2)',
        studentOverviewRes.status === 403 && alumniOverviewRes.status === 403,
        `student=${studentOverviewRes.status} alumni=${alumniOverviewRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S7 · Step 3 — Drill-down analytics (posts, jobs, users)');
    // ──────────────────────────────────────────────────────────────────────────

    // /analytics/posts
    const postsAnalyticsRes = await req(svcUrl('analytics', 'analytics/posts'), 'GET', null, adminToken);
    assert('S7.8  GET /analytics/posts → 200',
        postsAnalyticsRes.status === 200,
        `got HTTP ${postsAnalyticsRes.status}: ${JSON.stringify(postsAnalyticsRes.body)?.substring(0,80)}`);

    // /analytics/jobs
    const jobsAnalyticsRes = await req(svcUrl('analytics', 'analytics/jobs'), 'GET', null, adminToken);
    assert('S7.9  GET /analytics/jobs → 200',
        jobsAnalyticsRes.status === 200,
        `got HTTP ${jobsAnalyticsRes.status}`);

    // /analytics/users
    const usersAnalyticsRes = await req(svcUrl('analytics', 'analytics/users'), 'GET', null, adminToken);
    assert('S7.10 GET /analytics/users → 200',
        usersAnalyticsRes.status === 200,
        `got HTTP ${usersAnalyticsRes.status}`);

    // Optional pagination / days parameter
    const usersAnalytics7d = await req(
        svcUrl('analytics', 'analytics/users') + '?days=7', 'GET', null, adminToken);
    assert('S7.11 GET /analytics/users?days=7 → 200',
        usersAnalytics7d.status === 200,
        `got HTTP ${usersAnalytics7d.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S7 · Step 4 — RBAC on GET /analytics/latencies');
    // ──────────────────────────────────────────────────────────────────────────

    const studentLatencyRes = await req(svcUrl('analytics', 'analytics/latencies'), 'GET', null, studentToken);
    assert('S7.12 Student: GET /analytics/latencies → 403 Forbidden',
        studentLatencyRes.status === 403,
        `got HTTP ${studentLatencyRes.status}`);

    const alumniLatencyRes = await req(svcUrl('analytics', 'analytics/latencies'), 'GET', null, alumniToken);
    assert('S7.13 Alumni: GET /analytics/latencies → 403 Forbidden',
        alumniLatencyRes.status === 403,
        `got HTTP ${alumniLatencyRes.status}`);

    const adminLatencyRes = await req(svcUrl('analytics', 'analytics/latencies'), 'GET', null, adminToken);
    assert('S7.14 Admin: GET /analytics/latencies → 200',
        adminLatencyRes.status === 200,
        `got HTTP ${adminLatencyRes.status}: ${JSON.stringify(adminLatencyRes.body)?.substring(0,80)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S7 · Step 5 — Unauthenticated access blocked');
    // ──────────────────────────────────────────────────────────────────────────

    const unauthOverviewRes = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, null);
    assert('S7.15 Unauthenticated: GET /analytics/overview → 401',
        unauthOverviewRes.status === 401,
        `got HTTP ${unauthOverviewRes.status}`);

    const unauthLatencyRes = await req(svcUrl('analytics', 'analytics/latencies'), 'GET', null, null);
    assert('S7.16 Unauthenticated: GET /analytics/latencies → 401',
        unauthLatencyRes.status === 401,
        `got HTTP ${unauthLatencyRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S7 · Step 6 — Counts reflect real platform data');
    // ──────────────────────────────────────────────────────────────────────────

    // After S1–S6 tests have run, counters should be > 0
    const finalOverview = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, adminToken);
    assert('S7.17 overview.users ≥ 3 (at least our 3 test personas)',
        (finalOverview.body?.users ?? 0) >= 3,
        `users=${finalOverview.body?.users}`);

    assert('S7.18 overview.posts ≥ 1 (created during S2/S8)',
        (finalOverview.body?.posts ?? 0) >= 1,
        `posts=${finalOverview.body?.posts}`);

    assert('S7.19 overview.jobs ≥ 1 (created during S3/S6)',
        (finalOverview.body?.jobs ?? 0) >= 1,
        `jobs=${finalOverview.body?.jobs}`);

    assert('S7.20 overview.events ≥ 1 (created during S4/S8)',
        (finalOverview.body?.events ?? 0) >= 1,
        `events=${finalOverview.body?.events}`);

    summary('S7 — Admin Reviews Analytics Dashboard');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
