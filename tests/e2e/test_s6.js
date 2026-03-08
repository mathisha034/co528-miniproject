#!/usr/bin/env node
/**
 * S6 — Alumni Posts a Job Opportunity
 * =====================================
 * Actor  : Nimali (alumni) posts a job, manages it, closes it.
 *
 * Services: job-service, notification-service
 *
 * Key facts:
 *  - Alumni CAN create jobs (RolesGuard allows 'alumni' and 'admin')
 *  - CreateJobDto: { title, description, company, deadline?, type? } [G6.1 implemented]
 *    type: 'internship' | 'full-time' | 'part-time' | 'contract'
 *    GET /jobs?type=<value> filter supported (G6.1)
 *  - job-service dispatches GENERAL notification to poster on creation (G6.2)
 *  - GET /jobs returns open jobs only by default; ?status=all includes closed (G6.3)
 *  - An alumni who posts a job CAN view that job's applications
 * Run: node tests/e2e/test_s6.js
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, getUserId, svcUrl, sleep,
} = require('./shared');

async function main() {
    banner('S6 — Alumni Posts a Job Opportunity');

    const alumniToken   = loadToken('.e2e_alumni_token');
    const studentToken  = loadToken('.e2e_student_token');
    const adminToken    = loadToken('.e2e_admin_token');
    const alumniId      = getUserId(alumniToken);
    const studentId     = getUserId(studentToken);

    // ──────────────────────────────────────────────────────────────────────────
    section('S6 · Step 1 — Alumni Posts a Job');
    // ──────────────────────────────────────────────────────────────────────────

    const ts = Date.now();
    const createJobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title: `Software Engineer at Google [${ts}]`,
        company: 'Google',
        description: 'Join our Site Reliability Engineering team. ' +
            'Requirements: Go, Kubernetes, Distributed Systems.',
        deadline: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
    }, alumniToken);
    console.log(`  ▸ POST /jobs (alumni) → HTTP ${createJobRes.status}  body: ${JSON.stringify(createJobRes.body)?.substring(0,100)}`);

    assert('S6.1  Alumni: POST /jobs → 201 Created',
        createJobRes.status === 201 || createJobRes.status === 200,
        `got HTTP ${createJobRes.status}: ${JSON.stringify(createJobRes.body)}`);

    const jobId = createJobRes.body?._id || createJobRes.body?.id;
    assert('S6.2  Job has _id', !!jobId, `body: ${JSON.stringify(createJobRes.body)}`);

    assert('S6.3  Job status = "open"',
        createJobRes.body?.status === 'open',
        `status=${createJobRes.body?.status}`);

    assert('S6.4  Job postedBy = alumni userId (sub)',
        createJobRes.body?.postedBy === alumniId,
        `postedBy=${createJobRes.body?.postedBy}  expected=${alumniId.slice(0,8)}...`);

    // G6.1: CreateJobDto now accepts optional "type" field
    // Create a typed job to verify the field is persisted
    const typedJobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title: `Typed SWE Role [${ts}]`,
        company: 'TypeCo',
        description: 'G6.1 type field verification',
        deadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'full-time',
    }, alumniToken);
    assert('S6.5  POST /jobs with type="full-time" → 201 and response echoes type (G6.1)',
        (typedJobRes.status === 201 || typedJobRes.status === 200) &&
        typedJobRes.body?.type === 'full-time',
        `HTTP ${typedJobRes.status}  type=${typedJobRes.body?.type}`);

    // Student cannot create job
    const studentCreateJobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title: 'Unauthorized Job',
        description: 'Should fail',
        company: 'TestCo',
    }, studentToken);
    assert('S6.6  Student: POST /jobs → 403 Forbidden (student cannot post jobs)',
        studentCreateJobRes.status === 403,
        `got HTTP ${studentCreateJobRes.status}`);

    // Missing company → 400
    const noCompanyRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title: 'No Company Job',
        description: 'Missing company field',
    }, alumniToken);
    assert('S6.7  POST /jobs without company → 400 Bad Request',
        noCompanyRes.status === 400,
        `got HTTP ${noCompanyRes.status}: ${JSON.stringify(noCompanyRes.body)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S6 · Step 2 — Notification Check (Gap: not dispatched)');
    // ──────────────────────────────────────────────────────────────────────────

    await sleep(1000);
    const notifRes = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    assert('S6.8  GET /notifications → 200 (endpoint reachable)',
        notifRes.status === 200, `got HTTP ${notifRes.status}`);

    // G6.2: job-service now fires a GENERAL notification to the poster on creation
    const alumniNotifRes = await req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    const alumniNotifs = Array.isArray(alumniNotifRes.body) ? alumniNotifRes.body : [];
    const jobPostedNotif = alumniNotifs.find(
        n => n.type === 'general' &&
             (n.idempotencyKey === `job_posted:${jobId}:${alumniId}` ||
              n.message?.includes('Google'))
    );
    assert('S6.9  GENERAL notification dispatched to job poster on creation (G6.2)',
        !!jobPostedNotif,
        `found ${alumniNotifs.length} alumni notifs; general: ${
            JSON.stringify(alumniNotifs.filter(n => n.type === 'general').map(n => n.message))
        }`);
    if (jobPostedNotif) console.log(`  ▸ job_posted: "${jobPostedNotif.message}"`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S6 · Step 3 — Job Appears in Listing');
    // ──────────────────────────────────────────────────────────────────────────

    const listRes = await req(svcUrl('job', 'jobs'), 'GET', null, studentToken);
    assert('S6.10 GET /jobs → 200',
        listRes.status === 200, `got HTTP ${listRes.status}`);

    const jobs = Array.isArray(listRes.body) ? listRes.body : listRes.body?.jobs || [];
    const foundJob = jobs.some(j => (j._id || j.id) === jobId);
    assert('S6.11 Google SWE job appears in listings',
        foundJob, `jobId=${jobId} not found in ${jobs.length} jobs`);

    const googleJob = jobs.find(j => (j._id || j.id) === jobId);
    assert('S6.12 Job company = "Google"',
        googleJob?.company === 'Google',
        `company=${googleJob?.company}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S6 · Step 4 — Student Applies, Alumni Reviews Applications');
    // ──────────────────────────────────────────────────────────────────────────

    const applyRes = await req(
        svcUrl('job', `jobs/${jobId}/apply`), 'POST',
        { coverLetter: 'Strong Kubernetes experience. Ready to contribute.' },
        studentToken);
    assert('S6.13 Student: POST /jobs/:id/apply → 201 or 200',
        applyRes.status === 201 || applyRes.status === 200,
        `got HTTP ${applyRes.status}: ${JSON.stringify(applyRes.body)}`);

    // Alumni (job poster) reviews applications
    const appsRes = await req(
        svcUrl('job', `jobs/${jobId}/applications`), 'GET', null, alumniToken);
    assert('S6.14 Alumni (poster): GET /jobs/:id/applications → 200',
        appsRes.status === 200,
        `got HTTP ${appsRes.status}: ${JSON.stringify(appsRes.body)?.substring(0,80)}`);

    const appList = Array.isArray(appsRes.body) ? appsRes.body : [];
    assert('S6.15 Student\'s application appears in applications list',
        appList.some(a => a.applicantId === studentId),
        `applicantId=${studentId.slice(0,8)}... not found in ${appList.length} apps`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S6 · Step 5 — Close the Job');
    // ──────────────────────────────────────────────────────────────────────────

    const closeJobRes = await req(
        svcUrl('job', `jobs/${jobId}/status`), 'PATCH',
        { status: 'closed' }, alumniToken);
    assert('S6.16 Alumni: PATCH /jobs/:id/status → "closed" (200)',
        closeJobRes.status === 200,
        `got HTTP ${closeJobRes.status}: ${JSON.stringify(closeJobRes.body)}`);

    assert('S6.17 Job status updated to "closed"',
        closeJobRes.body?.status === 'closed',
        `status=${closeJobRes.body?.status}`);

    // GET /jobs should no longer return the closed job (if service filters by open)
    // job-service::findAll() returns ALL jobs without filtering by status
    const listAfterClose = await req(svcUrl('job', 'jobs'), 'GET', null, studentToken);
    const jobsAfterClose = Array.isArray(listAfterClose.body) ? listAfterClose.body : [];
    const closedJobInList = jobsAfterClose.find(j => (j._id || j.id) === jobId);
    console.log(`  ▸ Closed job in default listing: ${closedJobInList ? `yes (status=${closedJobInList?.status})` : 'no'}`);

    // G6.3: findAll() now defaults to OPEN jobs only
    assert('S6.18 Closed job NOT in GET /jobs default listing (G6.3)',
        !closedJobInList,
        `closed job ${jobId} (status="${closedJobInList?.status}") still appears in default listing`);

    // Verify the closed job is reachable via ?status=all
    const allJobsRes = await req(svcUrl('job', 'jobs?status=all'), 'GET', null, studentToken);
    const allJobs = Array.isArray(allJobsRes.body) ? allJobsRes.body : [];
    assert('S6.18b GET /jobs?status=all includes the closed job (G6.3)',
        allJobs.some(j => (j._id || j.id) === jobId),
        `closed job ${jobId} not found in ?status=all`);

    // Individual job still retrievable
    const jobDetailRes = await req(svcUrl('job', `jobs/${jobId}`), 'GET', null, studentToken);
    assert('S6.19 GET /jobs/:id for closed job → 200 (retrievable directly)',
        jobDetailRes.status === 200,
        `got HTTP ${jobDetailRes.status}`);

    assert('S6.20 Direct GET of closed job shows status = "closed"',
        jobDetailRes.body?.status === 'closed',
        `status=${jobDetailRes.body?.status}`);

    summary('S6 — Alumni Posts a Job Opportunity');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
