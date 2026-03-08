/**
 * test_s6_gaps.js  —  Unit tests for S6 gap implementations
 *
 * Tests all 3 S6 gaps in isolation:
 *   G6.1: CreateJobDto accepts optional "type" field (internship/full-time/…)
 *         and GET /jobs?type=<value> filters by type
 *   G6.2: POST /jobs dispatches a GENERAL notification to the job poster
 *   G6.3: GET /jobs default listing returns only OPEN jobs (closed jobs hidden);
 *         GET /jobs?status=all returns all jobs including closed
 *
 * This is a STANDALONE test — it does NOT modify test_s6.js.
 * Run individually:  node tests/e2e/test_s6_gaps.js
 *
 * Prerequisites: setup_personas.sh must have been run.
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, getUserId, svcUrl, sleep,
} = require('./shared');

async function main() {
    banner('S6-GAPS — Job Service: type field, creation notification, open-only listing');

    // ──────────────────────────────────────────────────────────────────────────
    section('Setup — Load tokens');
    // ──────────────────────────────────────────────────────────────────────────
    const alumniToken  = loadToken('.e2e_alumni_token');
    const studentToken = loadToken('.e2e_student_token');
    const alumniId     = getUserId(alumniToken);
    const ts           = Date.now();
    const deadline     = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // ──────────────────────────────────────────────────────────────────────────
    section('G6.1 — type field in CreateJobDto and ?type= listing filter');
    // ──────────────────────────────────────────────────────────────────────────

    // Create a full-time job
    const ftJobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title:       `Senior SRE [${ts}]`,
        company:     'Cloudflare',
        description: 'G6.1 full-time job test',
        deadline,
        type:        'full-time',
    }, alumniToken);

    assert('G6.1.1 Alumni: POST /jobs with type="full-time" → 201',
        ftJobRes.status === 201 || ftJobRes.status === 200,
        `got HTTP ${ftJobRes.status}: ${JSON.stringify(ftJobRes.body)}`);

    const ftJobId = ftJobRes.body?._id || ftJobRes.body?.id;
    assert('G6.1.2 Job has _id', !!ftJobId, JSON.stringify(ftJobRes.body));

    assert('G6.1.3 created job.type = "full-time" (G6.1)',
        ftJobRes.body?.type === 'full-time',
        `type=${ftJobRes.body?.type}`);

    // Create an internship job
    const intJobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title:       `Data Science Intern [${ts}]`,
        company:     'DeepMind',
        description: 'G6.1 internship job test',
        deadline,
        type:        'internship',
    }, alumniToken);

    assert('G6.1.4 POST /jobs with type="internship" → 201',
        intJobRes.status === 201 || intJobRes.status === 200,
        `HTTP ${intJobRes.status}`);

    const intJobId = intJobRes.body?._id || intJobRes.body?.id;

    assert('G6.1.5 created job.type = "internship" (G6.1)',
        intJobRes.body?.type === 'internship',
        `type=${intJobRes.body?.type}`);

    // Create a job without type (type is optional — backward-compat)
    const noTypeJobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title:       `Generic Role [${ts}]`,
        company:     'Acme',
        description: 'G6.1 no-type backward compat',
        deadline,
    }, alumniToken);

    assert('G6.1.6 POST /jobs without type → 201 (type is optional)',
        noTypeJobRes.status === 201 || noTypeJobRes.status === 200,
        `HTTP ${noTypeJobRes.status}`);

    assert('G6.1.7 Job without type has type=undefined (backward compat)',
        !noTypeJobRes.body?.type || noTypeJobRes.body?.type === null,
        `type=${noTypeJobRes.body?.type}`);

    // Invalid type → 400
    const badTypeRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title:   `Bad Type Job [${ts}]`,
        company: 'X',
        description: 'should fail',
        type:    'freelance',   // not in enum
    }, alumniToken);
    assert('G6.1.8 POST /jobs with invalid type → 400 Bad Request',
        badTypeRes.status === 400,
        `HTTP ${badTypeRes.status}`);

    // GET /jobs?type=full-time should include the Cloudflare job
    const ftListRes = await req(svcUrl('job', 'jobs?type=full-time'), 'GET', null, studentToken);
    assert('G6.1.9 GET /jobs?type=full-time → 200',
        ftListRes.status === 200,
        `HTTP ${ftListRes.status}`);

    const ftJobs = Array.isArray(ftListRes.body) ? ftListRes.body : ftListRes.body?.jobs || [];
    assert('G6.1.10 ?type=full-time results include the Cloudflare job (G6.1)',
        ftJobs.some(j => (j._id || j.id) === ftJobId),
        `ftJobId=${ftJobId} not found in ${ftJobs.length} jobs`);

    assert('G6.1.11 ?type=full-time results do NOT include internship job',
        !ftJobs.some(j => (j._id || j.id) === intJobId),
        `internship job found in full-time results`);

    // GET /jobs?type=internship should include DeepMind job
    const intListRes = await req(svcUrl('job', 'jobs?type=internship'), 'GET', null, studentToken);
    const intJobs = Array.isArray(intListRes.body) ? intListRes.body : intListRes.body?.jobs || [];
    assert('G6.1.12 ?type=internship results include the DeepMind job (G6.1)',
        intJobs.some(j => (j._id || j.id) === intJobId),
        `intJobId=${intJobId} not found in ${intJobs.length} jobs`);

    // ──────────────────────────────────────────────────────────────────────────
    section('G6.2 — POST /jobs dispatches GENERAL notification to poster');
    // ──────────────────────────────────────────────────────────────────────────

    // The ft job already triggered a notification; wait for async delivery
    console.log('  ▸ Waiting 1.5s for async notification delivery...');
    await sleep(1500);

    const alumniNotifs = await req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    assert('G6.2.1 GET /notifications (alumni/poster) → 200',
        alumniNotifs.status === 200,
        `HTTP ${alumniNotifs.status}`);

    const alumniNotifList = Array.isArray(alumniNotifs.body) ? alumniNotifs.body : [];
    const ftPostedNotif = alumniNotifList.find(
        n => n.type === 'general' &&
             (n.idempotencyKey === `job_posted:${ftJobId}:${alumniId}` ||
              n.message?.includes('Cloudflare'))
    );

    assert('G6.2.2 GENERAL notification in alumni inbox after POST /jobs (G6.2)',
        !!ftPostedNotif,
        `found ${alumniNotifList.length} notifications; general: ${
            JSON.stringify(alumniNotifList.filter(n => n.type === 'general').map(n => n.message))
        }`);

    if (ftPostedNotif) console.log(`  ▸ Notification: "${ftPostedNotif.message}"`);

    // Verify the internship also got a notification
    const intPostedNotif = alumniNotifList.find(
        n => n.type === 'general' &&
             (n.idempotencyKey === `job_posted:${intJobId}:${alumniId}` ||
              n.message?.includes('DeepMind'))
    );
    assert('G6.2.3 GENERAL notification also sent for internship posting (G6.2)',
        !!intPostedNotif,
        `intJobId=${intJobId} — general notifs: ${JSON.stringify(alumniNotifList.filter(n => n.type === 'general').map(n => n.message))}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('G6.3 — GET /jobs default returns only open; ?status=all shows closed');
    // ──────────────────────────────────────────────────────────────────────────

    // Create a job specifically for this test, then close it
    const closeTargetRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title:       `Job To Be Closed [${ts}]`,
        company:     'Closed Corp',
        description: 'G6.3: will be closed to test default filter',
        deadline,
    }, alumniToken);
    assert('G6.3.1 Create job for closure test → 201',
        closeTargetRes.status === 201 || closeTargetRes.status === 200,
        `HTTP ${closeTargetRes.status}`);

    const closeTargetId = closeTargetRes.body?._id || closeTargetRes.body?.id;

    // Close it
    const closeRes = await req(
        svcUrl('job', `jobs/${closeTargetId}/status`), 'PATCH',
        { status: 'closed' }, alumniToken);
    assert('G6.3.2 Close the job → 200',
        closeRes.status === 200,
        `HTTP ${closeRes.status}`);

    // Default GET /jobs should NOT contain the closed job
    const defaultListRes = await req(svcUrl('job', 'jobs'), 'GET', null, studentToken);
    assert('G6.3.3 GET /jobs (default) → 200',
        defaultListRes.status === 200,
        `HTTP ${defaultListRes.status}`);

    const defaultJobs = Array.isArray(defaultListRes.body) ? defaultListRes.body : defaultListRes.body?.jobs || [];
    assert('G6.3.4 Default listing does NOT include closed job (G6.3)',
        !defaultJobs.some(j => (j._id || j.id) === closeTargetId),
        `closed job found in default listing (status: ${defaultJobs.find(j => (j._id||j.id) === closeTargetId)?.status})`);

    assert('G6.3.5 All jobs in default listing have status="open"',
        defaultJobs.every(j => j.status === 'open'),
        `non-open jobs: ${JSON.stringify(defaultJobs.filter(j => j.status !== 'open').map(j => ({ id: j._id, status: j.status })))}`);

    // GET /jobs?status=all should include the closed job
    const allListRes = await req(svcUrl('job', 'jobs?status=all'), 'GET', null, studentToken);
    assert('G6.3.6 GET /jobs?status=all → 200',
        allListRes.status === 200,
        `HTTP ${allListRes.status}`);

    const allJobs = Array.isArray(allListRes.body) ? allListRes.body : allListRes.body?.jobs || [];
    assert('G6.3.7 ?status=all listing includes the closed job (G6.3)',
        allJobs.some(j => (j._id || j.id) === closeTargetId),
        `closeTargetId=${closeTargetId} not found in ${allJobs.length} jobs`);

    assert('G6.3.8 ?status=all listing includes the open full-time job too',
        allJobs.some(j => (j._id || j.id) === ftJobId),
        `ftJobId=${ftJobId} not found in ?status=all results`);

    // GET /jobs?status=closed should return only closed jobs
    const closedListRes = await req(svcUrl('job', 'jobs?status=closed'), 'GET', null, studentToken);
    const closedJobs = Array.isArray(closedListRes.body) ? closedListRes.body : closedListRes.body?.jobs || [];
    assert('G6.3.9 GET /jobs?status=closed returns only closed jobs (G6.3)',
        closedJobs.every(j => j.status === 'closed') && closedJobs.some(j => (j._id || j.id) === closeTargetId),
        `closed jobs: ${JSON.stringify(closedJobs.map(j => ({ id: j._id, status: j.status })))}`);

    // Combine filters: ?type=full-time returns only open full-time jobs by default
    const ftOpenRes = await req(svcUrl('job', 'jobs?type=full-time'), 'GET', null, studentToken);
    const ftOpenJobs = Array.isArray(ftOpenRes.body) ? ftOpenRes.body : ftOpenRes.body?.jobs || [];
    assert('G6.3.10 ?type=full-time does not include closed jobs (G6.1+G6.3 combined)',
        ftOpenJobs.every(j => j.status === 'open'),
        `non-open in ?type=full-time: ${JSON.stringify(ftOpenJobs.filter(j => j.status !== 'open'))}`);

    summary('S6-GAPS — Job Service Gap Implementations (G6.1–G6.3)');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
