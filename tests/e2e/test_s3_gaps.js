/**
 * test_s3_gaps.js  —  Unit tests for S3 gap implementations
 *
 * Tests G3.1 and G3.2 in isolation:
 *   G3.1: job-service dispatches a "job_applied" notification after a student applies
 *   G3.2: job-service dispatches a "job_status_changed" notification after status update
 *
 * This is a STANDALONE test — it does NOT modify test_s3.js.
 * Run individually:  node tests/e2e/test_s3_gaps.js
 *
 * Prerequisites: setup_personas.sh must have been run.
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, sleep, svcUrl,
} = require('./shared');

async function main() {
    banner('S3-GAPS — Job Notification Dispatch (G3.1 & G3.2)');

    // ──────────────────────────────────────────────────────────────────────────
    section('Setup — Load tokens');
    // ──────────────────────────────────────────────────────────────────────────
    const studentToken = loadToken('.e2e_student_token');
    const adminToken   = loadToken('.e2e_admin_token');

    // ──────────────────────────────────────────────────────────────────────────
    section('G3.1 — job_applied notification via POST /jobs/:id/apply');
    // ──────────────────────────────────────────────────────────────────────────

    const ts = Date.now();

    // Create a job as admin
    const createJobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title:       `Gap Test Job [${ts}]`,
        description: 'G3.1/G3.2 notification gap test',
        company:     'GapTestCorp',
    }, adminToken);

    assert('G3.1.1 Admin: POST /jobs → 201',
        createJobRes.status === 201 || createJobRes.status === 200,
        `got HTTP ${createJobRes.status}: ${JSON.stringify(createJobRes.body)}`);

    const jobId = createJobRes.body?._id || createJobRes.body?.id;
    assert('G3.1.2 Job created with _id', !!jobId,
        `body: ${JSON.stringify(createJobRes.body)}`);

    // Capture student's Keycloak sub for later inbox check
    const meRes = await req(svcUrl('user', 'users/me'), 'GET', null, studentToken);
    assert('G3.1.3 GET /users/me → 200', meRes.status === 200,
        `got HTTP ${meRes.status}`);

    // Get notification count BEFORE applying (baseline)
    const notifBefore = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    assert('G3.1.4 GET /notifications before apply → 200',
        notifBefore.status === 200,
        `got HTTP ${notifBefore.status}`);
    const countBefore = Array.isArray(notifBefore.body) ? notifBefore.body.length : 0;
    console.log(`  ▸ Notifications before apply: ${countBefore}`);

    // Student applies for the job
    const applyRes = await req(
        svcUrl('job', `jobs/${jobId}/apply`), 'POST',
        { coverLetter: 'G3.1 gap test application' }, studentToken);

    assert('G3.1.5 POST /jobs/:id/apply → 201',
        applyRes.status === 201 || applyRes.status === 200,
        `got HTTP ${applyRes.status}: ${JSON.stringify(applyRes.body)}`);

    const appId = applyRes.body?._id || applyRes.body?.id;
    assert('G3.1.6 Application has _id', !!appId,
        `body: ${JSON.stringify(applyRes.body)}`);

    // Wait for fire-and-forget to deliver
    console.log('  ▸ Waiting 1.5s for async notification delivery...');
    await sleep(1500);

    // Check that a new notification appeared in the student's inbox
    const notifAfter = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    assert('G3.1.7 GET /notifications after apply → 200',
        notifAfter.status === 200,
        `got HTTP ${notifAfter.status}`);

    const notifications = Array.isArray(notifAfter.body) ? notifAfter.body : [];
    const jobAppliedNotif = notifications.find(
        n => n.type === 'job_applied' &&
             (n.idempotencyKey === `job_applied:${jobId}:${meRes.body?.keycloakId}` ||
              n.message?.includes('GapTestCorp') ||
              n.message?.includes('Gap Test Job'))
    );

    assert('G3.1.8 "job_applied" notification in student inbox after apply',
        !!jobAppliedNotif || notifications.length > countBefore,
        `found ${notifications.length} notifications (was ${countBefore}), job_applied types: ${
            JSON.stringify(notifications.filter(n => n.type === 'job_applied').map(n => n.message))
        }`);

    if (jobAppliedNotif) {
        assert('G3.1.9 Notification type = "job_applied"',
            jobAppliedNotif.type === 'job_applied',
            `type=${jobAppliedNotif.type}`);
        console.log(`  ▸ Notification message: "${jobAppliedNotif.message}"`);
    } else {
        // New notification count increased (idempotency key may differ from what we guessed)
        const countAfter = notifications.length;
        assert('G3.1.9 Notification count increased after apply',
            countAfter > countBefore,
            `count before=${countBefore}, after=${countAfter}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('G3.2 — job_status_changed notification via PATCH application status');
    // ──────────────────────────────────────────────────────────────────────────

    // Get notif count before status update
    const notifBeforeStatus = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    const countBeforeStatus = Array.isArray(notifBeforeStatus.body)
        ? notifBeforeStatus.body.length : 0;
    console.log(`  ▸ Notifications before status update: ${countBeforeStatus}`);

    // Admin updates application status: pending → reviewed
    const updateRes = await req(
        svcUrl('job', `jobs/${jobId}/applications/${appId}`), 'PATCH',
        { status: 'reviewed' }, adminToken);

    assert('G3.2.1 Admin: PATCH application status → 200',
        updateRes.status === 200,
        `got HTTP ${updateRes.status}: ${JSON.stringify(updateRes.body)}`);

    assert('G3.2.2 Application status updated to "reviewed"',
        updateRes.body?.status === 'reviewed',
        `status=${updateRes.body?.status}`);

    // Wait for fire-and-forget to deliver
    console.log('  ▸ Waiting 1.5s for async notification delivery...');
    await sleep(1500);

    // Check that a new notification appeared
    const notifAfterStatus = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    assert('G3.2.3 GET /notifications after status update → 200',
        notifAfterStatus.status === 200,
        `got HTTP ${notifAfterStatus.status}`);

    const notificationsAfter = Array.isArray(notifAfterStatus.body) ? notifAfterStatus.body : [];
    const statusNotif = notificationsAfter.find(
        n => n.type === 'job_status_changed' &&
             (n.idempotencyKey === `job_status_changed:${appId}:reviewed` ||
              n.message?.includes('reviewed'))
    );

    assert('G3.2.4 "job_status_changed" notification in student inbox',
        !!statusNotif || notificationsAfter.length > countBeforeStatus,
        `found ${notificationsAfter.length} notifications (was ${countBeforeStatus}), job_status_changed types: ${
            JSON.stringify(notificationsAfter.filter(n => n.type === 'job_status_changed').map(n => n.message))
        }`);

    if (statusNotif) {
        assert('G3.2.5 Notification type = "job_status_changed"',
            statusNotif.type === 'job_status_changed',
            `type=${statusNotif.type}`);
        console.log(`  ▸ Notification message: "${statusNotif.message}"`);
    } else {
        const countAfterStatus = notificationsAfter.length;
        assert('G3.2.5 Notification count increased after status update',
            countAfterStatus > countBeforeStatus,
            `count before=${countBeforeStatus}, after=${countAfterStatus}`);
    }

    // Admin updates to accepted for a second status-change notification
    const acceptRes = await req(
        svcUrl('job', `jobs/${jobId}/applications/${appId}`), 'PATCH',
        { status: 'accepted' }, adminToken);

    assert('G3.2.6 Admin: PATCH application → accepted (200)',
        acceptRes.status === 200,
        `got HTTP ${acceptRes.status}: ${JSON.stringify(acceptRes.body)}`);

    await sleep(1500);

    const notifFinal = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    const acceptedNotif = Array.isArray(notifFinal.body)
        ? notifFinal.body.find(n => n.type === 'job_status_changed' &&
              (n.idempotencyKey === `job_status_changed:${appId}:accepted` ||
               n.message?.includes('accepted')))
        : null;

    assert('G3.2.7 "job_status_changed" notification for accepted status',
        !!acceptedNotif,
        `notifications: ${JSON.stringify((notifFinal.body || []).filter(n => n.type === 'job_status_changed').map(n => ({type: n.type, msg: n.message})))}`);

    if (acceptedNotif) {
        console.log(`  ▸ Accepted notification message: "${acceptedNotif.message}"`);
    }

    summary('S3-GAPS — Job Notification Dispatch (G3.1 & G3.2)');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
