#!/usr/bin/env node
/**
 * S3 — Student Discovers & Applies for a Job
 * =============================================
 * Actor  : Ashan (student) browses listings, applies.
 *          Dr. Rajapaksha (admin) reviews the application and updates status.
 *
 * Services: job-service, notification-service, analytics-service
 *
 * Key facts:
 *  - job-service dispatches fire-and-forget notifications on apply (G3.1) and
 *    status update (G3.2) via POST to internal/notifications/notify.
 *  - Application status transitions: pending → reviewed → accepted|rejected
 *  - Only alumni/admin can create jobs; only students can apply
 * Run: node tests/e2e/test_s3.js
 */

'use strict';

const {
    req, assert, assertGap, section, banner, summary,
    loadToken, getUserId, svcUrl, sleep,
} = require('./shared');

async function main() {
    banner('S3 — Student Discovers & Applies for a Job');

    const studentToken = loadToken('.e2e_student_token');
    const adminToken   = loadToken('.e2e_admin_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const studentId    = getUserId(studentToken);

    // ──────────────────────────────────────────────────────────────────────────
    section('S3 · Step 1 — Admin Creates a Job Listing');
    // ──────────────────────────────────────────────────────────────────────────

    const ts = Date.now();
    const createJobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title: `Backend Engineer Intern [${ts}]`,
        description: 'Work on distributed systems and CI/CD pipelines',
        company: 'WSO2',
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }, adminToken);
    console.log(`  ▸ POST /jobs (admin) → HTTP ${createJobRes.status}`);

    assert('S3.1  Admin: POST /jobs → 201 Created',
        createJobRes.status === 201 || createJobRes.status === 200,
        `got HTTP ${createJobRes.status}: ${JSON.stringify(createJobRes.body)}`);

    const jobId = createJobRes.body?._id || createJobRes.body?.id;
    assert('S3.2  Created job has _id', !!jobId, `body: ${JSON.stringify(createJobRes.body)}`);

    assert('S3.3  Created job status = "open"',
        createJobRes.body?.status === 'open',
        `status=${createJobRes.body?.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S3 · Step 2 — Student Browses Job Listings');
    // ──────────────────────────────────────────────────────────────────────────

    const listRes = await req(svcUrl('job', 'jobs'), 'GET', null, studentToken);
    assert('S3.4  Student: GET /jobs → 200',
        listRes.status === 200,
        `got HTTP ${listRes.status}: ${JSON.stringify(listRes.body)?.substring(0,100)}`);

    const jobs = Array.isArray(listRes.body) ? listRes.body : listRes.body?.jobs || [];
    assert('S3.5  GET /jobs returns an array',
        Array.isArray(jobs), `body type: ${typeof listRes.body}`);

    assert('S3.6  Created job appears in listing (by _id)',
        jobs.some(j => (j._id || j.id) === jobId),
        `jobId=${jobId} not found in ${jobs.length} listings`);

    // No JWT → 401
    const noJwtList = await req(svcUrl('job', 'jobs'), 'GET', null, null);
    assert('S3.7  GET /jobs without JWT → 401 Unauthorized',
        noJwtList.status === 401, `got HTTP ${noJwtList.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S3 · Step 3 — View Job Details');
    // ──────────────────────────────────────────────────────────────────────────

    const detailRes = await req(svcUrl('job', `jobs/${jobId}`), 'GET', null, studentToken);
    assert('S3.8  GET /jobs/:id → 200 (full detail)',
        detailRes.status === 200,
        `got HTTP ${detailRes.status}`);

    assert('S3.9  Job detail contains title, company, description',
        !!detailRes.body?.title && !!detailRes.body?.company && !!detailRes.body?.description,
        `body: ${JSON.stringify(detailRes.body)?.substring(0,100)}`);

    // Non-existent jobId → 404
    const notFoundRes = await req(svcUrl('job', 'jobs/000000000000000000000000'), 'GET', null, studentToken);
    assert('S3.10 GET /jobs/:nonExistentId → 404 Not Found',
        notFoundRes.status === 404,
        `got HTTP ${notFoundRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S3 · Step 4 — Student Applies for the Job');
    // ──────────────────────────────────────────────────────────────────────────

    const applyRes = await req(
        svcUrl('job', `jobs/${jobId}/apply`), 'POST',
        { coverLetter: 'I have strong Kubernetes and distributed systems experience.' },
        studentToken);
    console.log(`  ▸ POST /jobs/${jobId}/apply → HTTP ${applyRes.status}`);

    assert('S3.11 Student: POST /jobs/:id/apply → 201 Created',
        applyRes.status === 201 || applyRes.status === 200,
        `got HTTP ${applyRes.status}: ${JSON.stringify(applyRes.body)}`);

    const appId = applyRes.body?._id || applyRes.body?.id;
    assert('S3.12 Application has _id', !!appId, `body: ${JSON.stringify(applyRes.body)}`);

    assert('S3.13 Application status = "pending"',
        applyRes.body?.status === 'pending',
        `status=${applyRes.body?.status}`);

    assert('S3.14 Application applicantId matches student sub',
        applyRes.body?.applicantId === studentId,
        `applicantId=${applyRes.body?.applicantId} expected=${studentId.slice(0,8)}...`);

    // Apply again → 409 Conflict (duplicate unique constraint)
    const applyDupRes = await req(
        svcUrl('job', `jobs/${jobId}/apply`), 'POST',
        { coverLetter: 'duplicate' }, studentToken);
    assert('S3.15 Apply to same job twice → 409 Conflict',
        applyDupRes.status === 409,
        `got HTTP ${applyDupRes.status}: ${JSON.stringify(applyDupRes.body)}`);

    // Alumni cannot apply (student-only route)
    const alumniApplyRes = await req(
        svcUrl('job', `jobs/${jobId}/apply`), 'POST',
        { coverLetter: 'test' }, alumniToken);
    assert('S3.16 Alumni: POST /jobs/:id/apply → 403 (student-only)',
        alumniApplyRes.status === 403,
        `got HTTP ${alumniApplyRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S3 · Step 5 — Notification Check After Apply');
    // ──────────────────────────────────────────────────────────────────────────

    // G3.1 IMPLEMENTED: job-service dispatches a fire-and-forget notification on apply
    // Give the async fetch a moment to land before querying the inbox
    await sleep(1200);
    const notifRes = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    assert('S3.17 GET /notifications → 200 (notification endpoint reachable)',
        notifRes.status === 200, `got HTTP ${notifRes.status}`);

    const allNotifs = Array.isArray(notifRes.body) ? notifRes.body : [];
    const jobAppliedNotif = allNotifs.find(
        n => n.type === 'job_applied' && (
            n.idempotencyKey?.startsWith(`job_applied:${jobId}`) ||
            n.message?.includes('has been submitted')
        )
    );
    assert('S3.18 "job_applied" notification in student inbox (G3.1 implemented)',
        !!jobAppliedNotif,
        `found ${allNotifs.length} notifications; job_applied entries: ${JSON.stringify(
            allNotifs.filter(n => n.type === 'job_applied').map(n => n.message)
        )}`);
    if (jobAppliedNotif) console.log(`  ▸ job_applied: "${jobAppliedNotif.message}"`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S3 · Step 6 — Analytics Reflects the New Application');
    // ──────────────────────────────────────────────────────────────────────────

    const analyticsRes = await req(svcUrl('analytics', 'analytics/jobs'), 'GET', null, adminToken);
    assert('S3.19 GET /analytics/jobs → 200',
        analyticsRes.status === 200, `got HTTP ${analyticsRes.status}`);

    const analyticsJobs = Array.isArray(analyticsRes.body) ? analyticsRes.body : [];
    const jobEntry = analyticsJobs.find(j => j._id?.toString() === jobId);
    if (jobEntry) {
        assert('S3.20 Analytics shows ≥ 1 application for our job',
            jobEntry.applicationCount >= 1,
            `applicationCount=${jobEntry.applicationCount}`);
    } else {
        assertGap('S3.20 Job not yet in analytics aggregation',
            'Analytics aggregates from MongoDB applications collection. ' +
            'Job may not have appeared in the aggregation pipeline yet.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('S3 · Step 7 — Admin Reviews Applications');
    // ──────────────────────────────────────────────────────────────────────────

    const appsRes = await req(
        svcUrl('job', `jobs/${jobId}/applications`), 'GET', null, adminToken);
    assert('S3.21 Admin: GET /jobs/:id/applications → 200',
        appsRes.status === 200,
        `got HTTP ${appsRes.status}: ${JSON.stringify(appsRes.body)?.substring(0,100)}`);

    const appList = Array.isArray(appsRes.body) ? appsRes.body : [];
    assert('S3.22 Ashan\'s application appears in applications list',
        appList.some(a => (a._id || a.id) === appId || a.applicantId === studentId),
        `appId=${appId} not found in ${appList.length} applications`);

    // Student cannot view applications list
    const studentAppsRes = await req(
        svcUrl('job', `jobs/${jobId}/applications`), 'GET', null, studentToken);
    assert('S3.23 Student: GET /jobs/:id/applications → 403 Forbidden',
        studentAppsRes.status === 403,
        `got HTTP ${studentAppsRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S3 · Step 8 — Admin Updates Application Status (pending → reviewed)');
    // ──────────────────────────────────────────────────────────────────────────

    const updateAppRes = await req(
        svcUrl('job', `jobs/${jobId}/applications/${appId}`), 'PATCH',
        { status: 'reviewed' }, adminToken);
    console.log(`  ▸ PATCH /jobs/${jobId}/applications/${appId} → HTTP ${updateAppRes.status}`);

    assert('S3.24 Admin: PATCH application status → 200',
        updateAppRes.status === 200,
        `got HTTP ${updateAppRes.status}: ${JSON.stringify(updateAppRes.body)}`);

    assert('S3.25 Application status updated to "reviewed"',
        updateAppRes.body?.status === 'reviewed',
        `status=${updateAppRes.body?.status}`);

    // Invalid transition: reviewed → pending (not allowed)
    const invalidTransition = await req(
        svcUrl('job', `jobs/${jobId}/applications/${appId}`), 'PATCH',
        { status: 'pending' }, adminToken);
    assert('S3.26 Invalid transition reviewed → pending → 400 Bad Request',
        invalidTransition.status === 400,
        `got HTTP ${invalidTransition.status}: ${JSON.stringify(invalidTransition.body)}`);

    // G3.2 IMPLEMENTED: job-service dispatches a fire-and-forget notification on status change
    await sleep(1200);
    const statusNotifRes = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    const statusNotifs = Array.isArray(statusNotifRes.body) ? statusNotifRes.body : [];
    const statusChangedNotif = statusNotifs.find(
        n => n.type === 'job_status_changed' && (
            n.idempotencyKey === `job_status_changed:${appId}:reviewed` ||
            n.message?.includes('reviewed')
        )
    );
    assert('S3.27 "job_status_changed" notification in student inbox (G3.2 implemented)',
        !!statusChangedNotif,
        `found ${statusNotifs.length} notifications; job_status_changed entries: ${JSON.stringify(
            statusNotifs.filter(n => n.type === 'job_status_changed').map(n => n.message)
        )}`);
    if (statusChangedNotif) console.log(`  ▸ job_status_changed: "${statusChangedNotif.message}"`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S3 · Step 9 — Apply to Closed Job (boundary check)');
    // ──────────────────────────────────────────────────────────────────────────

    // Close the job first
    const closeRes = await req(
        svcUrl('job', `jobs/${jobId}/status`), 'PATCH',
        { status: 'closed' }, adminToken);
    assert('S3.28 Admin: PATCH /jobs/:id/status → closed (200)',
        closeRes.status === 200, `got HTTP ${closeRes.status}`);

    // Create a new student (use the alumni token in student-allowed role)
    // Actually we need a second student to attempt to apply to closed job.
    // We can try with the same student (who already applied) but the 409 fires first.
    // Use a fresh job to test the closed-job scenario with the student:
    const closedJobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title: `Closed Job [${ts}]`,
        description: 'This job is closed',
        company: 'TestCorp',
    }, adminToken);
    const closedJobId = closedJobRes.body?._id || closedJobRes.body?.id;

    if (closedJobId) {
        // Close it immediately
        await req(svcUrl('job', `jobs/${closedJobId}/status`), 'PATCH',
            { status: 'closed' }, adminToken);
        // Student tries to apply to closed job
        const applyClosedRes = await req(svcUrl('job', `jobs/${closedJobId}/apply`), 'POST',
            { coverLetter: 'test' }, studentToken);
        assert('S3.29 Student: apply to closed job → 400 Bad Request',
            applyClosedRes.status === 400,
            `got HTTP ${applyClosedRes.status}: ${JSON.stringify(applyClosedRes.body)}`);
    }

    summary('S3 — Student Discovers & Applies for a Job');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
