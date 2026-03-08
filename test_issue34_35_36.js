/**
 * Test Suite: Issues 34, 35, 36 — Analytics Service
 *
 * Issue 34 — Hardcoded Target Collection Flaw
 *   - GET /analytics-service/analytics/overview now queries `evententities` (not `events`)
 *
 * Issue 35 — Unverified Payload Attributes
 *   - GET /analytics-service/analytics/posts?limit=abc   → 400 BadRequest
 *   - GET /analytics-service/analytics/posts?limit=-1    → 400 BadRequest
 *   - GET /analytics-service/analytics/posts?limit=0     → 400 BadRequest
 *   - GET /analytics-service/analytics/posts?limit=5     → 200 OK (valid)
 *   - GET /analytics-service/analytics/users?days=xyz    → 400 BadRequest
 *   - GET /analytics-service/analytics/users?days=0      → 400 BadRequest
 *   - GET /analytics-service/analytics/users?days=7      → 200 OK (valid)
 *
 * Issue 36 — Tightly Coupled TSD PromQL Formatting
 *   - Source uses {__name__=~".*http_request_duration_ms_bucket"} regex selector
 *   - Admin GET /analytics-service/analytics/latencies → 200 OK (or empty data from Prometheus)
 */

'use strict';
const fs = require('fs');
const http = require('http');

const BASE = 'http://miniproject.local/api/v1';
const ANALYTICS = `${BASE}/analytics-service/analytics`;

const STUDENT_TOKEN = fs.readFileSync('.e2e_student_token', 'utf8').trim();
const ADMIN_TOKEN = fs.readFileSync('.e2e_admin_token', 'utf8').trim();

let passed = 0;
let failed = 0;
const failures = [];

function request(method, url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            port: parsed.port || 80,
            path: parsed.pathname + parsed.search,
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function authHeader(token) {
    return { Authorization: `Bearer ${token}` };
}

function pass(label, info = '') {
    passed++;
    console.log(`  ✅ PASS: ${label}${info ? '\n         ℹ  ' + info : ''}`);
}

function fail(label, info = '') {
    failed++;
    failures.push(label);
    console.log(`  ❌ FAIL: ${label}${info ? '\n         ℹ  ' + info : ''}`);
}

function assert(condition, passLabel, failLabel, info = '') {
    if (condition) pass(passLabel, info);
    else fail(failLabel, info);
}

async function readSourceFile(path) {
    try { return fs.readFileSync(path, 'utf8'); }
    catch { return ''; }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function printSeparator(title) {
    console.log(`\n══════════════════════════════════════════════════════════`);
    console.log(`  ${title}`);
    console.log(`══════════════════════════════════════════════════════════\n`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    printSeparator(
        'Issue 34 — Analytics Service: Hardcoded Target Collection Flaw\n  Issue 35 — Analytics Service: Unverified Payload Attributes\n  Issue 36 — Analytics Service: Tightly Coupled TSD PromQL Formatting'
    );

    // ── Issue 34 — Collection Name ─────────────────────────────────────────

    console.log('══ Issue 34 — Hardcoded Collection Flaw ══\n');

    console.log('── Test A: Source — analytics.service.ts uses "evententities" [Issue 34]');
    const svcSrc = await readSourceFile(
        'services/analytics-service/src/analytics/analytics.service.ts'
    );
    assert(
        svcSrc.includes("db.collection('evententities')"),
        'Source uses evententities collection name',
        'Source STILL uses wrong collection name',
        svcSrc.includes('evententities') ? 'found: evententities' : 'found: ' + (svcSrc.match(/db\.collection\('(\w+)'\)/g) || []).join(', ')
    );
    assert(
        !svcSrc.includes("db.collection('events')"),
        'Source does NOT use old "events" collection name',
        'Source STILL has db.collection("events")',
    );

    console.log('\n── Test B: GET /analytics/overview returns events count field [Issue 34]');
    const overviewRes = await request('GET', `${ANALYTICS}/overview`, null, authHeader(STUDENT_TOKEN));
    assert(
        overviewRes.status === 200,
        `GET /overview → 200 OK`,
        `GET /overview → unexpected ${overviewRes.status}`,
        JSON.stringify(overviewRes.body)
    );
    if (overviewRes.status === 200) {
        const body = overviewRes.body;
        assert(
            'events' in body && typeof body.events === 'number',
            `Response has numeric "events" field`,
            `Response missing "events" field`,
            JSON.stringify(body)
        );
        console.log(`         ℹ  overview counts: users=${body.users}, posts=${body.posts}, jobs=${body.jobs}, events=${body.events}`);
    }

    // ── Issue 35 — Unverified Query Params ────────────────────────────────

    console.log('\n══ Issue 35 — Unverified Payload Attributes ══\n');

    console.log('── Test C: GET /analytics/posts?limit=abc → 400 [Issue 35]');
    const limAbc = await request('GET', `${ANALYTICS}/posts?limit=abc`, null, authHeader(STUDENT_TOKEN));
    assert(
        limAbc.status === 400,
        '400 BadRequest on non-numeric limit',
        `Expected 400, got ${limAbc.status}`,
        JSON.stringify(limAbc.body)
    );

    console.log('── Test D: GET /analytics/posts?limit=0 → 400 [Issue 35]');
    const lim0 = await request('GET', `${ANALYTICS}/posts?limit=0`, null, authHeader(STUDENT_TOKEN));
    assert(
        lim0.status === 400,
        '400 BadRequest on limit=0',
        `Expected 400, got ${lim0.status}`,
        JSON.stringify(lim0.body)
    );

    console.log('── Test E: GET /analytics/posts?limit=-5 → 400 [Issue 35]');
    const limNeg = await request('GET', `${ANALYTICS}/posts?limit=-5`, null, authHeader(STUDENT_TOKEN));
    assert(
        limNeg.status === 400,
        '400 BadRequest on negative limit',
        `Expected 400, got ${limNeg.status}`,
        JSON.stringify(limNeg.body)
    );

    console.log('── Test F: GET /analytics/posts?limit=5 → 200 OK (valid) [Issue 35]');
    const limValid = await request('GET', `${ANALYTICS}/posts?limit=5`, null, authHeader(STUDENT_TOKEN));
    assert(
        limValid.status === 200,
        '200 OK on valid limit=5',
        `Expected 200, got ${limValid.status}`,
        `returned ${Array.isArray(limValid.body) ? limValid.body.length : '?'} posts`
    );

    console.log('── Test G: GET /analytics/users?days=xyz → 400 [Issue 35]');
    const daysXyz = await request('GET', `${ANALYTICS}/users?days=xyz`, null, authHeader(STUDENT_TOKEN));
    assert(
        daysXyz.status === 400,
        '400 BadRequest on non-numeric days',
        `Expected 400, got ${daysXyz.status}`,
        JSON.stringify(daysXyz.body)
    );

    console.log('── Test H: GET /analytics/users?days=0 → 400 [Issue 35]');
    const days0 = await request('GET', `${ANALYTICS}/users?days=0`, null, authHeader(STUDENT_TOKEN));
    assert(
        days0.status === 400,
        '400 BadRequest on days=0',
        `Expected 400, got ${days0.status}`,
        JSON.stringify(days0.body)
    );

    console.log('── Test I: GET /analytics/users?days=7 → 200 OK (valid) [Issue 35]');
    const daysValid = await request('GET', `${ANALYTICS}/users?days=7`, null, authHeader(STUDENT_TOKEN));
    assert(
        daysValid.status === 200,
        '200 OK on valid days=7',
        `Expected 200, got ${daysValid.status}`,
        `returned ${Array.isArray(daysValid.body) ? daysValid.body.length : '?'} records`
    );

    console.log('\n── Test J: Source — controller uses Number.isInteger guard [Issue 35]');
    const ctrlSrc = await readSourceFile(
        'services/analytics-service/src/analytics/analytics.controller.ts'
    );
    assert(
        ctrlSrc.includes('Number.isInteger'),
        'Controller has Number.isInteger guard for query params',
        'Controller is missing Number.isInteger guard',
        ctrlSrc.includes('isInteger') ? '✓ isInteger found' : '✗ not found'
    );
    assert(
        ctrlSrc.includes('BadRequestException'),
        'Controller imports and throws BadRequestException',
        'Controller missing BadRequestException',
    );

    // ── Issue 36 — PromQL Regex ────────────────────────────────────────────

    console.log('\n══ Issue 36 — PromQL Regex Selector ══\n');

    console.log('── Test K: Source — getServiceLatencies uses {__name__=~".*..."} regex [Issue 36]');
    assert(
        svcSrc.includes('__name__=~'),
        'Source uses {__name__=~".*http_request_duration_ms_bucket"} PromQL regex',
        'Source uses old literal metric name (no regex)',
        svcSrc.includes('__name__') ? '✓ __name__=~ found' : '✗ not found'
    );
    assert(
        !svcSrc.includes("rate(http_request_duration_ms_bucket["),
        'Source does NOT use old unhardcoded PromQL without namespace match',
        'Source still uses old PromQL without __name__ regex',
    );

    console.log('── Test L: Admin GET /analytics/latencies → 200 or Prometheus error (not 404/500) [Issue 36]');
    const latRes = await request('GET', `${ANALYTICS}/latencies`, null, authHeader(ADMIN_TOKEN));
    assert(
        latRes.status === 200,
        `Admin GET /latencies → 200 OK`,
        `GET /latencies → unexpected ${latRes.status}`,
        JSON.stringify(latRes.body).slice(0, 200)
    );
    if (latRes.status === 200) {
        // The response may have status:"error" from Prometheus unreachable — that's OK
        // The key test is that the service responds correcty (not 500 crash)
        const promStatus = latRes.body?.status;
        console.log(`         ℹ  Prometheus response status: ${promStatus || 'n/a'}`);
        if (promStatus === 'success') {
            const resultCount = latRes.body?.data?.result?.length;
            console.log(`         ℹ  PromQL result count: ${resultCount}`);
        }
    }

    console.log('── Test M: GET /analytics/latencies as student → 403 Forbidden [Issue 36]');
    const latStudent = await request('GET', `${ANALYTICS}/latencies`, null, authHeader(STUDENT_TOKEN));
    assert(
        latStudent.status === 403,
        '403 Forbidden for student accessing admin-only latencies',
        `Expected 403, got ${latStudent.status}`,
        JSON.stringify(latStudent.body)
    );

    // ── Summary ────────────────────────────────────────────────────────────
    console.log(`\n══════════════════════════════════════════════════════════`);
    console.log(`  Results: ${passed} passed | ${failed} failed | 0 skipped`);
    console.log(`══════════════════════════════════════════════════════════`);
    if (failures.length) {
        console.log('\nFailing tests:');
        failures.forEach((f) => console.log(`  - ${f}`));
    }
}

main().catch(console.error);
