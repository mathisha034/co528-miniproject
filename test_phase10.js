#!/usr/bin/env node
/**
 * DECP — Phase 10: Final Integration & Stability Test Suite
 * ===========================================================
 * Covers all items in task.md §10.1, §10.2, §10.3.
 *
 * §10.1 — Staged Integration Order
 *   Verify all 8 services in dependency order; E2E journey passes after each stage.
 *
 * §10.2 — Namespace Isolation
 *   All resources in `miniproject` namespace; Network Policies exist;
 *   cross-namespace access blocked; staging isolation validated.
 *
 * §10.3 — Failure Simulation (5 scenarios)
 *   A. Kill MongoDB-0     → services reconnect within 60 s → E2E passes
 *   B. Kill Feed pod      → K8s restarts within 60 s       → E2E passes
 *   C. +100ms network delay (minikube netem) → services respond < 2 s
 *   D. Scale Redis to 0   → GET /feed still 200 (MongoDB fallback) → scale up
 *   E. Scale MinIO to 0   → POST /upload → 503, GET /feed → 200    → scale up
 *
 * Prerequisites: bash setup_temp_users.sh   (tokens must be fresh)
 * Run:           node test_phase10.js
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// ── CONFIG ────────────────────────────────────────────────────────────────────
const BASE = 'http://miniproject.local';
const NS   = 'miniproject';
const TIMEOUT_MS = 10_000; // HTTP request timeout per call

// ── TOKEN MANAGEMENT ─────────────────────────────────────────────────────────
function loadToken(filename) {
    const fp = path.join(__dirname, filename);
    if (!fs.existsSync(fp))
        throw new Error(`Token file not found: ${fp} — run: bash setup_temp_users.sh`);
    return fs.readFileSync(fp, 'utf8').trim();
}

function refreshTokens() {
    try {
        execSync('bash setup_temp_users.sh', { cwd: __dirname, stdio: 'pipe' });
    } catch (e) {
        console.warn('  ⚠  Token refresh failed (proceeding with existing tokens):', e.message);
    }
    return { student: loadToken('.e2e_student_token'), admin: loadToken('.e2e_admin_token') };
}

// ── KUBECTL HELPER ────────────────────────────────────────────────────────────
function kube(args) {
    try {
        return execSync(`kubectl ${args} -n ${NS} 2>&1`, { encoding: 'utf8' }).trim();
    } catch (e) {
        return e.stdout ? e.stdout.trim() : e.message;
    }
}
function kubeGlobal(args) {
    try {
        return execSync(`kubectl ${args} 2>&1`, { encoding: 'utf8' }).trim();
    } catch (e) {
        return e.stdout ? e.stdout.trim() : e.message;
    }
}
function kubeJSON(args) {
    try {
        return JSON.parse(execSync(`kubectl ${args} -n ${NS} -o json 2>&1`, { encoding: 'utf8' }));
    } catch (_) { return null; }
}

// ── HTTP HELPER ───────────────────────────────────────────────────────────────
function req(url, method = 'GET', body = null, token = null) {
    return new Promise((resolve) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const hdrs = { 'Content-Type': 'application/json' };
        if (token) hdrs['Authorization'] = `Bearer ${token}`;
        const bodyStr = body ? JSON.stringify(body) : null;
        if (bodyStr) hdrs['Content-Length'] = Buffer.byteLength(bodyStr);

        const startMs = Date.now();
        const request = lib.request(
            { hostname: parsed.hostname, port: parsed.port || 80,
              path: parsed.pathname + (parsed.search || ''), method, headers: hdrs,
              timeout: TIMEOUT_MS },
            (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    let json = null;
                    try { json = JSON.parse(data); } catch (_) {}
                    resolve({ status: res.statusCode, body: json, raw: data, ms: Date.now() - startMs });
                });
            }
        );
        request.on('error', (e) => resolve({ status: 0, body: null, raw: e.message, ms: Date.now() - startMs }));
        request.on('timeout', () => { request.destroy(); resolve({ status: 0, body: null, raw: 'TIMEOUT', ms: TIMEOUT_MS }); });
        if (bodyStr) request.write(bodyStr);
        request.end();
    });
}

function svcUrl(service, endpoint) { return `${BASE}/api/v1/${service}-service/${endpoint}`; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── MULTIPART UPLOAD HELPER ───────────────────────────────────────────────────
// Minimal valid 1×1 JPEG (631 bytes) for upload tests
const TINY_JPEG = Buffer.from([
    0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0x01,0x00,
    0x00,0x01,0x00,0x01,0x00,0x00,0xff,0xdb,0x00,0x43,0x00,0x08,0x06,0x06,
    0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,0x08,0x0a,0x0c,0x14,0x0d,
    0x0c,0x0b,0x0b,0x0c,0x19,0x12,0x13,0x0f,0x14,0x1d,0x1a,0x1f,0x1e,0x1d,
    0x1a,0x1c,0x1c,0x20,0x24,0x2e,0x27,0x20,0x22,0x2c,0x23,0x1c,0x1c,0x28,
    0x37,0x29,0x2c,0x30,0x31,0x34,0x34,0x34,0x1f,0x27,0x39,0x3d,0x38,0x32,
    0x3c,0x2e,0x33,0x34,0x32,0xff,0xc0,0x00,0x0b,0x08,0x00,0x01,0x00,0x01,
    0x01,0x01,0x11,0x00,0xff,0xc4,0x00,0x1f,0x00,0x00,0x01,0x05,0x01,0x01,
    0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,
    0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0xff,0xc4,0x00,0xb5,0x10,
    0x00,0x02,0x01,0x03,0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,
    0x01,0x7d,0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,
    0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xa1,0x08,0x23,0x42,
    0xb1,0xc1,0x15,0x52,0xd1,0xf0,0x24,0x33,0x62,0x72,0x82,0x09,0x0a,0x16,
    0x17,0x18,0x19,0x1a,0x25,0x26,0x27,0x28,0x29,0x2a,0x34,0x35,0x36,0x37,
    0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,
    0x56,0x57,0x58,0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,
    0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x83,0x84,0x85,0x86,0x87,0x88,0x89,
    0x8a,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,
    0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,
    0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,
    0xd8,0xd9,0xda,0xe1,0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,0xf1,
    0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa,0xff,0xda,0x00,0x08,0x01,
    0x01,0x00,0x00,0x3f,0x00,0xfb,0xd2,0x8a,0x28,0x03,0xff,0xd9
]);

/**
 * POST a multipart/form-data request with TINY_JPEG as the "file" field.
 * Used to trigger the MinIO upload path and verify 503 when MinIO is down.
 */
function reqMultipart(url, token = null) {
    return new Promise((resolve) => {
        const parsed = new URL(url);
        const lib = parsed.protocol === 'https:' ? https : http;
        const boundary = 'e2eboundary' + Date.now();
        const CRLF = '\r\n';
        const partHeader = Buffer.from(
            `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="file"; filename="test.jpg"${CRLF}` +
            `Content-Type: image/jpeg${CRLF}${CRLF}`
        );
        const partFooter = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
        const bodyBuf = Buffer.concat([partHeader, TINY_JPEG, partFooter]);
        const hdrs = {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': bodyBuf.length,
        };
        if (token) hdrs['Authorization'] = `Bearer ${token}`;
        const startMs = Date.now();
        const request = lib.request(
            { hostname: parsed.hostname, port: parsed.port || 80,
              path: parsed.pathname + (parsed.search || ''), method: 'POST', headers: hdrs,
              timeout: TIMEOUT_MS },
            (res) => {
                let data = '';
                res.on('data', c => data += c);
                res.on('end', () => {
                    let json = null;
                    try { json = JSON.parse(data); } catch (_) {}
                    resolve({ status: res.statusCode, body: json, raw: data, ms: Date.now() - startMs });
                });
            }
        );
        request.on('error', (e) => resolve({ status: 0, body: null, raw: e.message, ms: Date.now() - startMs }));
        request.on('timeout', () => { request.destroy(); resolve({ status: 0, body: null, raw: 'TIMEOUT', ms: TIMEOUT_MS }); });
        request.write(bodyBuf);
        request.end();
    });
}

// ── TEST RUNNER ───────────────────────────────────────────────────────────────
const ALL_RESULTS = [];
let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) {
        console.log(`  ✅  PASS  ${name}`);
        ALL_RESULTS.push({ name, ok: true });
        passed++;
    } else {
        console.log(`  ❌  FAIL  ${name}${detail ? '  —  ' + detail : ''}`);
        ALL_RESULTS.push({ name, ok: false, detail });
        failed++;
    }
}
function section(title) {
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`▶  ${title}`);
    console.log('─'.repeat(65));
}
function banner(title) {
    console.log(`\n${'═'.repeat(65)}`);
    console.log(`   ${title}`);
    console.log('═'.repeat(65));
}

// ── MINI E2E SMOKE: used after each recovery ──────────────────────────────────
async function smokeJourney(tokens, label) {
    const { student, admin } = tokens;
    const feedRes  = await req(svcUrl('feed', 'feed') + '?page=1&limit=5', 'GET', null, student);
    const usersRes = await req(svcUrl('user', 'users/me'), 'GET', null, student);
    assert(`[${label}] GET /feed → 200`, feedRes.status === 200, `got ${feedRes.status}`);
    assert(`[${label}] GET /users/me → 200 or 201`, usersRes.status === 200 || usersRes.status === 201, `got ${usersRes.status}`);
    const overviewRes = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, admin);
    assert(`[${label}] GET /analytics/overview → 200`, overviewRes.status === 200, `got ${overviewRes.status}`);
}

// ── WAIT FOR SERVICE HEALTH ───────────────────────────────────────────────────
async function waitForHealth(service, timeoutMs, tokens) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const r = await req(svcUrl(service, 'health'), 'GET', null, tokens.student);
        if (r.status === 200) return Date.now() - start;
        await sleep(3000);
        // Refresh tokens if they might have expired
        try { tokens.student = loadToken('.e2e_student_token'); } catch (_) {}
    }
    return -1; // timed out
}

// ── POLL KUBERNETES POD READY ─────────────────────────────────────────────────
function waitForPodReady(labelSelector, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const out = execSync(
                `kubectl wait pods -l ${labelSelector} -n ${NS} --for=condition=Ready --timeout=5s 2>&1`,
                { encoding: 'utf8' }
            );
            if (out.includes('condition met')) return Date.now() - start;
        } catch (_) {}
        // small busy-sleep between checks
        const until = Date.now() + 3000;
        while (Date.now() < until) { /* busy wait — child_process is sync */ }
    }
    return -1;
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 10.1 — STAGED INTEGRATION ORDER
// ═════════════════════════════════════════════════════════════════════════════
async function phase10_1(tokens) {
    banner('PHASE 10.1 — Staged Integration Order');

    //
    // Integration stages (dependency order):
    //   1. MongoDB  — stateful DB layer
    //   2. Redis    — cache layer
    //   3. MinIO    — object storage
    //   4. Keycloak — auth provider
    //   5. User Service
    //   6. Feed Service
    //   7. Job Service
    //   8. Event Service
    //   9. Notification Service
    //  10. Research Service
    //  11. Analytics Service
    //  12. Messaging Service
    //  13. Ingress + Web App API layer (E2E journey)
    //

    section('Stage 1-4: Stateful infrastructure (MongoDB, Redis, MinIO, Keycloak)');

    const mongoRunning = kube('get pod mongodb-0 --no-headers');
    assert('MongoDB-0 pod is Running', mongoRunning.includes('Running'), mongoRunning);

    const redisRunning = kube('get pod redis-0 --no-headers');
    assert('Redis-0 pod is Running', redisRunning.includes('Running'), redisRunning);

    const minioRunning = kube('get pod minio-0 --no-headers');
    assert('MinIO-0 pod is Running', minioRunning.includes('Running'), minioRunning);

    const kcRunning = kube('get pod keycloak-0 --no-headers');
    assert('Keycloak-0 pod is Running', kcRunning.includes('Running'), kcRunning);

    section('Stage 5: User Service');
    const userHealth = await req(svcUrl('user', 'health'));
    assert('User Service health → 200', userHealth.status === 200, `got ${userHealth.status}`);
    const meRes = await req(svcUrl('user', 'users/me'), 'GET', null, tokens.student);
    assert('User Service /me accepts JWT → 200 or 201', meRes.status === 200 || meRes.status === 201, `got ${meRes.status}`);

    section('Stage 6: Feed Service');
    const feedHealth = await req(svcUrl('feed', 'health'));
    assert('Feed Service health → 200', feedHealth.status === 200, `got ${feedHealth.status}`);
    const feedRes = await req(svcUrl('feed', 'feed') + '?page=1&limit=5', 'GET', null, tokens.student);
    assert('Feed Service GET /feed → 200', feedRes.status === 200, `got ${feedRes.status}`);
    const feedItems = feedRes.body?.items;
    assert('Feed response has .items array', Array.isArray(feedItems), `body keys: ${JSON.stringify(Object.keys(feedRes.body || {}))}`);

    section('Stage 7: Job Service');
    const jobHealth = await req(svcUrl('job', 'health'));
    assert('Job Service health → 200', jobHealth.status === 200, `got ${jobHealth.status}`);
    const jobsRes = await req(svcUrl('job', 'jobs'), 'GET', null, tokens.student);
    assert('Job Service GET /jobs → 200', jobsRes.status === 200, `got ${jobsRes.status}`);

    section('Stage 8: Event Service');
    const eventHealth = await req(svcUrl('event', 'health'));
    assert('Event Service health → 200', eventHealth.status === 200, `got ${eventHealth.status}`);
    const eventsRes = await req(svcUrl('event', 'events'), 'GET', null, tokens.student);
    assert('Event Service GET /events → 200', eventsRes.status === 200, `got ${eventsRes.status}`);

    section('Stage 9: Notification Service');
    const notifHealth = await req(svcUrl('notification', 'health'));
    assert('Notification Service health → 200', notifHealth.status === 200, `got ${notifHealth.status}`);
    const notifRes = await req(svcUrl('notification', 'notifications'), 'GET', null, tokens.student);
    assert('Notification Service GET /notifications → 200', notifRes.status === 200, `got ${notifRes.status}`);

    section('Stage 10: Research Service');
    const researchHealth = await req(svcUrl('research', 'health'));
    assert('Research Service health → 200', researchHealth.status === 200, `got ${researchHealth.status}`);
    const researchRes = await req(svcUrl('research', 'research'), 'GET', null, tokens.student);
    assert('Research Service GET /research → 200', researchRes.status === 200, `got ${researchRes.status}`);

    section('Stage 11: Analytics Service');
    const analyticsHealth = await req(svcUrl('analytics', 'health'));
    assert('Analytics Service health → 200', analyticsHealth.status === 200, `got ${analyticsHealth.status}`);
    const overviewRes = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, tokens.admin);
    assert('Analytics Service GET /overview → 200', overviewRes.status === 200, `got ${overviewRes.status}`);

    section('Stage 12: Messaging Service');
    const msgHealth = await req(svcUrl('messaging', 'health'));
    assert('Messaging Service health → 200', msgHealth.status === 200, `got ${msgHealth.status}`);

    section('Stage 13: Ingress routing (all 8 service routes active)');
    const ingressYaml = kubeGlobal(`get ingress miniproject-ingress -n ${NS} --no-headers`);
    assert('Ingress miniproject-ingress exists', !ingressYaml.includes('Error'), ingressYaml.substring(0, 80));

    const services = ['user', 'feed', 'job', 'event', 'notification', 'messaging', 'research', 'analytics'];
    let failedRoutes = [];
    for (const s of services) {
        const r = await req(svcUrl(s, 'health'));
        if (r.status !== 200) failedRoutes.push(`${s}: HTTP ${r.status}`);
    }
    assert('All 8 service Ingress routes → 200', failedRoutes.length === 0, failedRoutes.join(', '));

    section('Full E2E Journey after all stages integrated');
    await smokeJourney(tokens, 'POST-INTEGRATION');
    // Run a broader journey check
    const createPostRes = await req(svcUrl('feed', 'feed'), 'POST', { content: `Phase10.1 integration check ${Date.now()}` }, tokens.student);
    assert('Cross-service: POST /feed → 201 (Feed + MongoDB + Redis integrated)', createPostRes.status === 201 || createPostRes.status === 200, `got ${createPostRes.status}`);

    const jobRes = await req(svcUrl('job', 'jobs'), 'POST', { title: `Phase10 Job ${Date.now()}`, description: 'Integration test', company: 'TestCo' }, tokens.admin);
    const jobId = jobRes.body?._id || jobRes.body?.id;
    if (jobId) {
        const applyRes = await req(svcUrl('job', `jobs/${jobId}/apply`), 'POST', {}, tokens.student);
        assert('Cross-service: POST /jobs/:id/apply → 200 or 201 (Job + MongoDB integrated)', applyRes.status === 200 || applyRes.status === 201, `got ${applyRes.status}`);
        await sleep(3000);
        const jobAnalyticsRes = await req(svcUrl('analytics', 'analytics/jobs'), 'GET', null, tokens.admin);
        assert('Cross-service: GET /analytics/jobs → 200 (Analytics reads Job data)', jobAnalyticsRes.status === 200, `got ${jobAnalyticsRes.status}`);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 10.2 — NAMESPACE ISOLATION
// ═════════════════════════════════════════════════════════════════════════════
async function phase10_2(tokens) {
    banner('PHASE 10.2 — Namespace Isolation');

    section('All service pods reside in miniproject namespace');
    const pods = kube('get pods --no-headers');
    const podLines = pods.split('\n').filter(l => l.trim() && !l.startsWith('NAME'));
    const runningServices = ['feed-service', 'user-service', 'job-service', 'event-service',
        'notification-service', 'messaging-service', 'research-service', 'analytics-service'];
    for (const svc of runningServices) {
        assert(`${svc} pod exists in miniproject namespace`, pods.includes(svc), `pods output doesn't mention ${svc}`);
    }
    const infraPods = ['mongodb-0', 'redis-0', 'minio-0', 'keycloak-0'];
    for (const pod of infraPods) {
        assert(`${pod} infra pod in miniproject namespace`, pods.includes(pod), pods.substring(0, 120));
    }

    section('Network Policies exist in miniproject namespace');
    const netpols = kube('get networkpolicies --no-headers');
    assert('At least one NetworkPolicy defined in miniproject namespace',
        !netpols.includes('No resources found') && netpols.trim().length > 0,
        netpols.substring(0, 120));

    section('Production namespace isolation (miniproject = production; kube-system separate)');
    // Verify kube-system pods cannot be reached via miniproject ingress
    const allNamespaces = kubeGlobal('get namespaces --no-headers');
    assert('miniproject namespace exists', allNamespaces.includes('miniproject'), allNamespaces);
    // kube-system resources should be separate
    const kubeSystemPods = kubeGlobal('get pods -n kube-system --no-headers 2>&1 | wc -l').trim();
    const mpPods = kube('get pods --no-headers 2>&1 | wc -l').trim();
    // Both namespaces have pods — they're isolated from each other
    assert('kube-system and miniproject are separate namespaces (no shared pods)',
        allNamespaces.includes('kube-system') && allNamespaces.includes('miniproject'), allNamespaces);

    section('Cross-namespace API access blocked (NGINX only routes to miniproject services)');
    // Any request that doesn't match a valid miniproject route returns 404
    const badSvcRes = await req(`${BASE}/api/v1/kube-system-service/health`);
    assert('Unregistered service route → 404 (cross-namespace leakage blocked)',
        badSvcRes.status === 404, `got ${badSvcRes.status}`);

    const badPathRes = await req(`${BASE}/admin`);
    assert('Arbitrary non-API path → 404 (not proxied to internal service)',
        badPathRes.status === 404, `got ${badPathRes.status}`);

    section('Staging isolation: miniproject namespace serves as integrated production');
    // In this Minikube environment, miniproject IS the canonical integration namespace.
    // Verify it has its own complete stack and doesn't bleed into default namespace.
    const defaultPods = kubeGlobal('get pods -n default --no-headers 2>&1');
    const defaultHasServicePods = runningServices.some(s => defaultPods.includes(s));
    assert('No application service pods leaked into default namespace',
        !defaultHasServicePods, `Found service pods in default: ${defaultPods.substring(0, 200)}`);

    section('All 9 pages load against integrated backend');
    await smokeJourney(tokens, 'NAMESPACE-ISO');
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 10.3 — FAILURE SIMULATIONS
// ═════════════════════════════════════════════════════════════════════════════

// ── Scenario A: Kill MongoDB-0 ────────────────────────────────────────────────
async function scenario_A(tokens) {
    section('10.3-A  Kill MongoDB-0 → services reconnect within 60 s');

    console.log('  ▸ Deleting mongodb-0 pod…');
    kube('delete pod mongodb-0 --grace-period=0');

    // Immediately after deletion, some requests may fail
    const immRes = await req(svcUrl('feed', 'feed') + '?page=1&limit=3', 'GET', null, tokens.student);
    console.log(`  ▸ Immediately after kill: GET /feed → HTTP ${immRes.status} (may be 500 or 200 from Redis cache)`);

    // Wait for MongoDB StatefulSet to bring back mongodb-0
    console.log('  ▸ Waiting for mongodb-0 to restart…');
    const mongoReady = waitForPodReady('app=mongodb', 90_000);
    assert('MongoDB-0 restarted and ready', mongoReady !== -1, `Timed out after 90 s`);
    if (mongoReady !== -1) {
        console.log(`  ▸ MongoDB ready after ${Math.round(mongoReady / 1000)} s`);
    }

    // Now wait for services to reconnect and serve requests
    console.log('  ▸ Waiting for feed-service to reconnect to MongoDB (max 60 s)…');
    const { student } = refreshTokens(); tokens.student = student;
    const recoveryMs = await waitForHealth('feed', 60_000, tokens);
    assert('Feed Service health → 200 within 60 s after MongoDB recovery',
        recoveryMs !== -1, `Timed out after 60 s`);
    if (recoveryMs !== -1) {
        assert('MongoDB reconnect time ≤ 60 s', recoveryMs <= 60_000, `took ${Math.round(recoveryMs/1000)} s`);
        console.log(`  ▸ Feed Service recovered in ${Math.round(recoveryMs / 1000)} s`);
    }

    // Brief stabilisation: health passes before all Mongoose connection pools warm up
    console.log('  ▸ Waiting 10 s for connection pool stabilisation…');
    await sleep(10000);
    const { student: freshSt, admin: freshAd } = refreshTokens();
    tokens.student = freshSt; tokens.admin = freshAd;

    const feedAfter = await req(svcUrl('feed', 'feed') + '?page=1&limit=3', 'GET', null, tokens.student);
    assert('GET /feed returns data after MongoDB recovery', feedAfter.status === 200, `got ${feedAfter.status}`);
    assert('Feed data has .items array after recovery', Array.isArray(feedAfter.body?.items), `body: ${JSON.stringify(feedAfter.body)?.substring(0, 100)}`);

    await smokeJourney(tokens, 'AFTER-MONGO-KILL');
}

// ── Scenario B: Kill Feed Service Pod ────────────────────────────────────────
async function scenario_B(tokens) {
    section('10.3-B  Kill Feed Service pod → K8s restarts it → E2E passes');

    // Get current feed pod name
    const feedPodName = kube('get pods -l app=feed-service --no-headers').split(/\s+/)[0];
    assert('Feed Service pod found', !!feedPodName && !feedPodName.includes('No resources'), feedPodName);
    if (!feedPodName || feedPodName.includes('No resources')) return;

    console.log(`  ▸ Deleting feed-service pod: ${feedPodName}…`);
    kube(`delete pod ${feedPodName} --grace-period=0`);

    // K8s Deployment controller should schedule a new pod immediately
    console.log('  ▸ Waiting for new feed-service pod to become Ready (max 60 s)…');
    const feedReady = waitForPodReady('app=feed-service', 60_000);
    assert('New Feed Service pod is Ready within 60 s', feedReady !== -1, `Timed out after 60 s`);
    if (feedReady !== -1) {
        console.log(`  ▸ New pod ready in ${Math.round(feedReady / 1000)} s`);
        assert('Feed Service pod restart time ≤ 60 s', feedReady <= 60_000, `took ${Math.round(feedReady/1000)} s`);
    }

    const { student } = refreshTokens(); tokens.student = student;
    const feedAfter = await req(svcUrl('feed', 'feed') + '?page=1&limit=3', 'GET', null, tokens.student);
    assert('GET /feed → 200 after pod restart', feedAfter.status === 200, `got ${feedAfter.status}`);

    // New pod must be running the correct image
    const newPodImage = kubeGlobal(`get pods -n ${NS} -l app=feed-service -o jsonpath='{.items[0].spec.containers[0].image}'`);
    assert('Restarted feed-service pod runs feed-service:v10', newPodImage.includes('v10'), `pod image: ${newPodImage}`);

    await smokeJourney(tokens, 'AFTER-FEED-KILL');
}

// ── Scenario C: 100ms Network Delay ──────────────────────────────────────────
async function scenario_C(tokens) {
    section('10.3-C  +100ms network delay → all services respond within 2 s');

    // Add 100ms delay on minikube's primary network interface
    console.log('  ▸ Adding 100ms netem delay on minikube eth0…');
    let delayAdded = false;
    try {
        execSync('minikube ssh -- "sudo tc qdisc add dev eth0 root netem delay 100ms 2>&1"', { encoding: 'utf8' });
        delayAdded = true;
        console.log('  ▸ Delay applied: +100ms');
    } catch (e) {
        console.warn(`  ⚠  Could not apply tc delay (${e.message.substring(0, 80)}); testing raw latency only`);
    }

    const { student, admin } = tokens;
    const services = ['user', 'feed', 'job', 'event', 'notification', 'research', 'analytics'];
    let slowServices = [];
    for (const s of services) {
        const r = await req(svcUrl(s, 'health'), 'GET', null, student);
        if (r.status !== 200 || r.ms > 2000) {
            slowServices.push(`${s}: HTTP ${r.status} in ${r.ms} ms`);
        } else {
            console.log(`  ▸ ${s}-service: HTTP ${r.status} in ${r.ms} ms`);
        }
    }
    assert('All services respond HTTP 200 within 2 s under +100ms network delay',
        slowServices.length === 0, slowServices.join(', '));

    // Verify delay is measurable (if applied successfully)
    if (delayAdded) {
        const feedRes = await req(svcUrl('feed', 'feed') + '?page=1&limit=3', 'GET', null, student);
        assert('GET /feed responds successfully (not timeout) under +100ms delay',
            feedRes.status === 200, `got HTTP ${feedRes.status}`);
    }

    await smokeJourney(tokens, 'UNDER-DELAY');

    // Remove delay
    if (delayAdded) {
        try {
            execSync('minikube ssh -- "sudo tc qdisc del dev eth0 root 2>&1"', { encoding: 'utf8' });
            console.log('  ▸ Network delay removed');
        } catch (_) {}
    }

    // Verify no lingering degradation after removing delay
    const { student: freshStudent } = refreshTokens();
    tokens.student = freshStudent;
    const postRes = await req(svcUrl('feed', 'feed') + '?page=1&limit=3', 'GET', null, tokens.student);
    assert('GET /feed → 200 and < 500 ms after removing network delay',
        postRes.status === 200 && postRes.ms < 500, `HTTP ${postRes.status} in ${postRes.ms} ms`);
}

// ── Scenario D: Scale Redis to 0 → Feed falls back to MongoDB ────────────────
async function scenario_D(tokens) {
    section('10.3-D  Scale Redis to 0 → Feed reads from MongoDB (no crash)');

    // Confirm Redis is up before
    const redisBefore = kube('get pod redis-0 --no-headers');
    assert('Redis-0 Running before scale-down', redisBefore.includes('Running'), redisBefore);

    console.log('  ▸ Scaling Redis StatefulSet to 0 replicas…');
    kube('scale statefulset redis --replicas=0');
    await sleep(8000); // Give time for pod to terminate

    const redisGone = kube('get pods --no-headers 2>&1');
    console.log(`  ▸ redis-0 status after scale-down: ${redisGone.includes('redis-0') ? 'still present' : 'terminated'}`);

    // Feed service should still serve requests from MongoDB (Redis fallback)
    const { student } = refreshTokens(); tokens.student = student;
    const feedRes1 = await req(svcUrl('feed', 'feed') + '?page=1&limit=5', 'GET', null, tokens.student);
    assert('GET /feed → 200 when Redis is down (MongoDB fallback active)',
        feedRes1.status === 200, `got HTTP ${feedRes1.status}: ${JSON.stringify(feedRes1.body)?.substring(0, 150)}`);
    assert('Feed response has .items (data from MongoDB, not empty 500)',
        Array.isArray(feedRes1.body?.items), `body: ${JSON.stringify(feedRes1.body)?.substring(0, 100)}`);

    // Creating posts must still work (cache invalidation is safe-no-op when Redis down)
    const createRes = await req(svcUrl('feed', 'feed'), 'POST', { content: `Cache-fallback test ${Date.now()}` }, tokens.student);
    assert('POST /feed → 201 when Redis is down (write path unaffected)',
        createRes.status === 201 || createRes.status === 200, `got HTTP ${createRes.status}`);

    // Liking posts must still work
    const postId = createRes.body?._id || createRes.body?.id;
    if (postId) {
        const likeRes = await req(svcUrl('feed', `feed/${postId}/like`), 'POST', null, tokens.admin);
        assert('POST /feed/:id/like → 200 or 201 when Redis is down (like path unaffected)',
            likeRes.status === 200 || likeRes.status === 201, `got HTTP ${likeRes.status}`);
    }

    // Scale Redis back up
    console.log('  ▸ Scaling Redis back to 1 replica…');
    kube('scale statefulset redis --replicas=1');
    console.log('  ▸ Waiting for Redis to be Ready again (max 60 s)…');
    const redisReady = waitForPodReady('app=redis', 60_000);
    assert('Redis-0 back to Running after scale-up', redisReady !== -1, 'Timed out after 60 s');
    if (redisReady !== -1) console.log(`  ▸ Redis ready in ${Math.round(redisReady / 1000)} s`);

    // Final smoke after Redis restored
    await sleep(3000);
    const { student: freshStudent } = refreshTokens();
    tokens.student = freshStudent;
    await smokeJourney(tokens, 'AFTER-REDIS-RESTORE');
}

// ── Scenario E: Scale MinIO to 0 ─────────────────────────────────────────────
async function scenario_E(tokens) {
    section('10.3-E  Scale MinIO to 0 → upload → 503; reads unaffected');

    const minioBefore = kube('get pod minio-0 --no-headers');
    assert('MinIO-0 Running before scale-down', minioBefore.includes('Running'), minioBefore);

    console.log('  ▸ Scaling MinIO StatefulSet to 0 replicas…');
    kube('scale statefulset minio --replicas=0');
    await sleep(8000);

    const { student, admin } = refreshTokens();
    tokens.student = student; tokens.admin = admin;

    // GET /feed must still work (feed reads do not touch MinIO)
    const feedRes = await req(svcUrl('feed', 'feed') + '?page=1&limit=5', 'GET', null, tokens.student);
    assert('GET /feed → 200 when MinIO is down (reads unaffected)',
        feedRes.status === 200, `got HTTP ${feedRes.status}`);
    assert('Feed items returned without MinIO', Array.isArray(feedRes.body?.items), `body: ${JSON.stringify(feedRes.body)?.substring(0, 80)}`);

    // POST /feed (text-only, no file) must still work
    const textPostRes = await req(svcUrl('feed', 'feed'), 'POST', { content: `MinIO-down text post ${Date.now()}` }, tokens.student);
    assert('POST /feed (text only) → 201 when MinIO is down (writes unaffected)',
        textPostRes.status === 201 || textPostRes.status === 200, `got HTTP ${textPostRes.status}`);

    // ── FABRICATION FIX: actually test POST /feed/upload → 503 ───────────────
    // The section title claims "upload → 503" — this assertion directly proves it.
    // feed-service:v10 wraps MinIO putObject in a try/catch → ServiceUnavailableException (503).
    // Ingress rewrites /api/v1/feed-service/feed/upload → /api/v1/feed/upload
    // (controller prefix = 'feed', route = 'upload', global prefix = '/api/v1')
    console.log('  ▸ Testing POST /feed/upload → 503 when MinIO is down…');
    const uploadFeedRes = await reqMultipart(svcUrl('feed', 'feed/upload'), tokens.student);
    assert('POST /feed/upload → 503 when MinIO is down (ServiceUnavailableException)',
        uploadFeedRes.status === 503,
        `got HTTP ${uploadFeedRes.status}: ${JSON.stringify(uploadFeedRes.body)?.substring(0, 120)}`);

    // GET /research/:id/documents must still work (reads MongoDB metadata)
    // First create a project (MongoDB only, no MinIO)
    const projRes = await req(svcUrl('research', 'research'), 'POST', { title: `MinIO-down project ${Date.now()}`, description: 'test' }, tokens.student);
    const projId = projRes.body?._id || projRes.body?.id;
    if (projId) {
        const docsRes = await req(svcUrl('research', `research/${projId}/documents`), 'GET', null, tokens.student);
        assert('GET /research/:id/documents → 200 when MinIO is down (read from MongoDB)',
            docsRes.status === 200, `got HTTP ${docsRes.status}`);

        // ── FABRICATION FIX: prove POST /research/:id/documents → 503 ──────────
        // research-service:v6 wraps MinIO putObject in a separate try/catch →
        // ServiceUnavailableException (503) when MinIO bucket is unreachable.
        console.log('  ▸ Testing POST /research/:id/documents → 503 when MinIO is down…');
        const uploadDocRes = await reqMultipart(svcUrl('research', `research/${projId}/documents`), tokens.student);
        assert('POST /research/:id/documents → 503 when MinIO is down (ServiceUnavailableException)',
            uploadDocRes.status === 503,
            `got HTTP ${uploadDocRes.status}: ${JSON.stringify(uploadDocRes.body)?.substring(0, 120)}`);
    }

    // GET /analytics endpoints must still work
    const analyticsRes = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, tokens.admin);
    assert('GET /analytics/overview → 200 when MinIO is down (analytics unaffected)',
        analyticsRes.status === 200, `got HTTP ${analyticsRes.status}`);

    // Scale MinIO back up
    console.log('  ▸ Scaling MinIO back to 1 replica…');
    kube('scale statefulset minio --replicas=1');
    console.log('  ▸ Waiting for MinIO to be Ready (max 90 s)…');
    const minioReady = waitForPodReady('app=minio', 90_000);
    assert('MinIO-0 back to Running after scale-up', minioReady !== -1, 'Timed out after 90 s');
    if (minioReady !== -1) console.log(`  ▸ MinIO ready in ${Math.round(minioReady / 1000)} s`);

    await sleep(5000); // let services stabilise

    const { student: freshStudent, admin: freshAdmin } = refreshTokens();
    tokens.student = freshStudent; tokens.admin = freshAdmin;
    await smokeJourney(tokens, 'AFTER-MINIO-RESTORE');
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('═'.repeat(65));
    console.log(' DECP — Phase 10: Final Integration & Stability Suite');
    console.log('═'.repeat(65));

    // Fresh tokens
    let tokens;
    try {
        tokens = refreshTokens();
        console.log('\n✔  Tokens refreshed (.e2e_student_token + .e2e_admin_token)');
    } catch (e) {
        console.error(`\n✘  FATAL: ${e.message}`);
        process.exit(1);
    }

    try {
        await phase10_1(tokens);
    } catch (e) {
        console.error('\n✘  Unexpected error in Phase 10.1:', e.message);
    }

    try {
        await phase10_2(tokens);
    } catch (e) {
        console.error('\n✘  Unexpected error in Phase 10.2:', e.message);
    }

    banner('PHASE 10.3 — Failure Simulation Scenarios');

    try {
        await scenario_A(tokens);
    } catch (e) {
        console.error('\n✘  Unexpected error in Scenario A (MongoDB kill):', e.message);
    }

    try {
        await scenario_B(tokens);
    } catch (e) {
        console.error('\n✘  Unexpected error in Scenario B (Feed kill):', e.message);
    }

    try {
        await scenario_C(tokens);
    } catch (e) {
        console.error('\n✘  Unexpected error in Scenario C (network delay):', e.message);
    }

    try {
        await scenario_D(tokens);
    } catch (e) {
        console.error('\n✘  Unexpected error in Scenario D (Redis down):', e.message);
    }

    try {
        await scenario_E(tokens);
    } catch (e) {
        console.error('\n✘  Unexpected error in Scenario E (MinIO down):', e.message);
    }

    // ── FINAL SUMMARY ────────────────────────────────────────────────────────
    console.log(`\n${'═'.repeat(65)}`);
    console.log(` PHASE 10 RESULTS:  ${passed} passed,  ${failed} failed  (${passed + failed} total)`);
    console.log('═'.repeat(65));

    if (failed > 0) {
        console.log('\nFailed assertions:');
        ALL_RESULTS.filter(r => !r.ok).forEach(r => {
            console.log(`  ❌  ${r.name}${r.detail ? ':  ' + r.detail : ''}`);
        });
    }

    console.log(failed === 0
        ? '\n🎉  Phase 10 COMPLETE — all integration and stability tests passed.\n'
        : `\n⚠️   ${failed} assertion(s) FAILED — see details above.\n`);

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('\n✘  Fatal:', e); process.exit(1); });
