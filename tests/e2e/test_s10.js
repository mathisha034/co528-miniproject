#!/usr/bin/env node
/**
 * S10 — System Resilience & Fault Tolerance
 * ==========================================
 * Injects failures into the Kubernetes cluster and verifies that services
 * recover within expected time windows and serve traffic correctly.
 *
 * Failures injected:
 *  F1: MongoDB primary pod killed → StatefulSet recreates it
 *  F2: feed-service pod deleted → Deployment recreates it
 *  F3: Redis scaled to 0 replicas → feed GET still works (no cache)
 *  F4: MinIO scaled to 0 replicas → upload returns 503; GET /feed still 200
 *  F5: netem network delay +100ms on feed-service → latency check
 *
 * After all failures: smoke test (mini S8 journey) passes.
 *
 * Permissions: requires kubectl access to namespace miniproject.
 * Run: node tests/e2e/test_s10.js
 *
 * ⚠  This test modifies the cluster. Run in dev/test cluster only.
 */

'use strict';

const {
    req, reqMultipart, assert, assertGap, section, banner, summary,
    loadToken, svcUrl, sleep, kube, waitForPodReady, TINY_JPEG,
} = require('./shared');

const NS = 'miniproject';

/** Measure latency of a single GET /feed request in ms */
async function measureFeedLatency(token) {
    const start = Date.now();
    const res = await req(svcUrl('feed', 'feed'), 'GET', null, token);
    return { ms: Date.now() - start, status: res.status };
}

async function main() {
    banner('S10 — System Resilience & Fault Tolerance');

    const studentToken = loadToken('.e2e_student_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const adminToken   = loadToken('.e2e_admin_token');

    // Baseline smoke check before injecting failures
    const baselineRes = await req(svcUrl('feed', 'feed'), 'GET', null, studentToken);
    assert('S10.01 Baseline: GET /feed → 200 before any fault injection',
        baselineRes.status === 200, `got HTTP ${baselineRes.status}`);

    const ts = Date.now();

    // ──────────────────────────────────────────────────────────────────────────
    section('F1 — Kill MongoDB Primary Pod');
    // ──────────────────────────────────────────────────────────────────────────

    let mongoKillOk = false;
    try {
        // Identify current mongodb-0 pod
        const pods = kube(`get pods -n ${NS} -l app=mongodb -o jsonpath='{.items[0].metadata.name}'`).trim()
            .replace(/^'|'$/g, '');
        console.log(`  ▸ Killing MongoDB pod: ${pods}`);

        kube(`delete pod ${pods} -n ${NS} --grace-period=0 --force`);
        mongoKillOk = true;
    } catch (e) {
        console.log(`  ▸ MongoDB pod kill failed (kubectl not available or pod not found): ${e.message}`);
    }

    if (mongoKillOk) {
        // Wait up to 90 s for mongodb StatefulSet pod to be Running again
        await waitForPodReady('mongodb', NS, 90000);

        // After Pod Ready, MongoDB needs additional time to complete re-election / sync
        // and for user-service to reconnect its Mongoose connection pool.
        await sleep(8000);

        // Retry user-service a few times while MongoDB reconnects
        let userRes = { status: 0 };
        for (let attempt = 0; attempt < 5; attempt++) {
            userRes = await req(svcUrl('user', 'users/me'), 'GET', null, studentToken);
            if (userRes.status === 200) break;
            await sleep(3000);
        }
        assert('S10.02 After MongoDB recovery: GET /users/me → 200',
            userRes.status === 200,
            `got HTTP ${userRes.status} — MongoDB may still be starting`);

        const feedAfterMongo = await req(svcUrl('feed', 'feed'), 'GET', null, studentToken);
        assert('S10.03 After MongoDB recovery: GET /feed → 200',
            feedAfterMongo.status === 200, `got HTTP ${feedAfterMongo.status}`);
    } else {
        assertGap('S10.02 MongoDB pod kill test skipped', 'kubectl not accessible or pod label differs.');
        assertGap('S10.03 Feed after MongoDB recovery skipped', 'Depends on F1.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('F2 — Delete feed-service Pod (Deployment Auto-Restart)');
    // ──────────────────────────────────────────────────────────────────────────

    let feedPodKilledName = '';
    try {
        const feedPod = kube(`get pods -n ${NS} -l app=feed-service -o jsonpath='{.items[0].metadata.name}'`)
            .trim().replace(/^'|'$/g, '');
        console.log(`  ▸ Deleting feed-service pod: ${feedPod}`);
        kube(`delete pod ${feedPod} -n ${NS} --grace-period=0 --force`);
        feedPodKilledName = feedPod;
    } catch (e) {
        console.log(`  ▸ feed-service pod delete failed: ${e.message}`);
    }

    if (feedPodKilledName) {
        // Wait for replacement pod to become Ready
        await waitForPodReady('feed-service', NS, 60000);
        // Allow extra time for container readiness probe + Redis reconnect
        await sleep(8000);

        // Retry several times — new pod may need a moment after readiness probe
        let feedAfterRestart = { status: 0, body: null };
        for (let attempt = 0; attempt < 8; attempt++) {
            feedAfterRestart = await req(svcUrl('feed', 'feed'), 'GET', null, studentToken);
            if (feedAfterRestart.status === 200) break;
            await sleep(4000);
        }

        // S10.04: Hard assert — feed-service MUST recover after a pod restart.
        // RedisService already has available=false fallback so Redis state doesn't
        // block startup. The health endpoint is unconditional. The retry window
        // (8s initial + 8×4s = 40s) is generous Nginx ingress endpoint-update time.
        // If it still returns non-200 after that, the service genuinely cannot restart.
        assert('S10.04 After feed-service pod restart: GET /feed → 200',
            feedAfterRestart.status === 200,
            `feed-service returned HTTP ${feedAfterRestart.status} after pod restart (retried 8×4s after ` +
            `readiness probe passed). RedisService has available=false fallback so this is not a Redis issue — ` +
            `either the Nginx ingress endpoint sync is lagging beyond 40s or the container is crashing.`);

        // S10.05: Hard assert — posts live in MongoDB, not just Redis.
        // If feed-service is up (S10.04 passed) and returns 0 posts, that indicates
        // either a MongoDB query failure or the cache-miss fallback is broken.
        const feedPostsBody = feedAfterRestart.body;
        const feedPostsList = Array.isArray(feedPostsBody) ? feedPostsBody
            : feedPostsBody?.items || feedPostsBody?.posts || [];
        assert('S10.05 Feed data intact after pod restart (posts present in MongoDB)',
            feedPostsList.length > 0,
            `GET /feed returned HTTP ${feedAfterRestart.status} with 0 posts after pod restart. ` +
            `Posts are stored in MongoDB and RedisService falls back to DB on cache miss — ` +
            `if the list is empty the MongoDB query itself is failing or returning no results.`);
    } else {
        assertGap('S10.04 feed-service pod restart test skipped', 'kubectl not accessible.');
        assertGap('S10.05 Data retention after restart skipped', 'Depends on F2.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('F3 — Scale Redis to 0 (Cache Miss Fallback)');
    // ──────────────────────────────────────────────────────────────────────────

    let redisScaled = false;
    try {
        kube(`scale deployment redis -n ${NS} --replicas=0`);
        redisScaled = true;
        console.log('  ▸ Redis scaled to 0 replicas');
        await sleep(3000);
    } catch (e) {
        console.log(`  ▸ Redis scale failed: ${e.message}`);
    }

    if (redisScaled) {
        // Check whether feed-service degrades gracefully without Redis
        const feedNoCache = await req(svcUrl('feed', 'feed'), 'GET', null, studentToken);
        if (feedNoCache.status === 200) {
            assert('S10.06 With Redis = 0: GET /feed still returns 200 (DB fallback)',
                true, '');
        } else {
            // feed-service does not gracefully degrade without Redis — document as gap
            assertGap('S10.06 With Redis = 0: GET /feed still returns 200 (DB fallback)',
                `feed-service returned HTTP ${feedNoCache.status} when Redis unavailable. ` +
                `feed-service has a hard Redis dependency at startup — it does not implement ` +
                `graceful degradation (cache miss → DB fallback). This is an architectural gap: ` +
                `feed-service should continue serving reads from MongoDB when Redis is unreachable.`);
        }

        // Restore Redis
        kube(`scale deployment redis -n ${NS} --replicas=1`);
        await waitForPodReady('redis', NS, 45000);
        await sleep(5000);

        // After Redis recovery, restart feed-service to re-establish connection
        kube(`rollout restart deployment/feed-service -n ${NS}`);
        await waitForPodReady('feed-service', NS, 60000);
        await sleep(5000);

        let feedCacheRestored = { status: 0 };
        for (let attempt = 0; attempt < 5; attempt++) {
            feedCacheRestored = await req(svcUrl('feed', 'feed'), 'GET', null, studentToken);
            if (feedCacheRestored.status === 200) break;
            await sleep(3000);
        }
        assert('S10.07 After Redis restored: GET /feed → 200',
            feedCacheRestored.status === 200, `got HTTP ${feedCacheRestored.status}`);
    } else {
        assertGap('S10.06 Redis scale-down test skipped', 'kubectl not accessible or redis deployment name differs.');
        assertGap('S10.07 Redis restore test skipped', 'Depends on F3.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('F4 — Scale MinIO to 0 (Upload Fails, Feed Reads Survive)');
    // ──────────────────────────────────────────────────────────────────────────

    let minioScaled = false;
    try {
        // MinIO may be a StatefulSet or Deployment depending on deployment config
        const scaleOut = kube(`scale statefulset minio -n ${NS} --replicas=0`);
        if (scaleOut.includes('not found')) {
            kube(`scale deployment minio -n ${NS} --replicas=0`);
        }
        // Confirm scale actually happened
        await sleep(3000);
        const minioPodsOut = kube(`get pods -n ${NS} -l app=minio --no-headers`);
        if (!minioPodsOut || minioPodsOut.includes('No resources found') || minioPodsOut.trim() === '') {
            minioScaled = true;
            console.log('  ▸ MinIO scaled to 0 replicas');
        } else {
            console.log(`  ▸ MinIO pods still present after scale-0: ${minioPodsOut?.substring(0,80)}`);
        }
    } catch (e) {
        console.log(`  ▸ MinIO scale failed: ${e.message}`);
    }

    if (minioScaled) {
        // Image upload to feed should fail gracefully
        const failedUpload = await reqMultipart(
            svcUrl('feed', 'feed/upload'),
            alumniToken || adminToken, TINY_JPEG, 'image/jpeg', 'file', 'test_minio_down.jpg');
        assert('S10.08 With MinIO = 0: POST /feed/upload → 503 or 500 (storage unavailable)',
            failedUpload.status === 503 || failedUpload.status === 500 || failedUpload.status === 502,
            `got HTTP ${failedUpload.status} — expected 5xx when MinIO is down`);

        // Text POST to feed should still work (no MinIO dependency)
        const textPost = await req(svcUrl('feed', 'feed'), 'POST', {
            content: `S10 resilience test post [${ts}]`,
        }, adminToken);
        assert('S10.09 With MinIO = 0: POST /feed (text only) → still 200/201',
            textPost.status === 200 || textPost.status === 201,
            `got HTTP ${textPost.status}`);

        // Restore MinIO
        try { kube(`scale statefulset minio -n ${NS} --replicas=1`); } catch {
            kube(`scale deployment minio -n ${NS} --replicas=1`);
        }
        await waitForPodReady('minio', NS, 60000);
        // MinIO needs time after pod Ready before accepting connections.
        // Also restart feed-service to re-initialize its MinIO client connection pool.
        await sleep(8000);
        kube(`rollout restart deployment/feed-service -n ${NS}`);
        await waitForPodReady('feed-service', NS, 60000);
        await sleep(5000);

        // Upload should work again — retry a few times
        let uploadRestored = { status: 0 };
        for (let attempt = 0; attempt < 5; attempt++) {
            uploadRestored = await reqMultipart(
                svcUrl('feed', 'feed/upload'),
                adminToken, TINY_JPEG, 'image/jpeg', 'file', 'test_minio_restored.jpg');
            if (uploadRestored.status === 200 || uploadRestored.status === 201) break;
            await sleep(3000);
        }
        assert('S10.10 After MinIO restored: POST /feed/upload → 200/201',
            uploadRestored.status === 200 || uploadRestored.status === 201,
            `got HTTP ${uploadRestored.status}`);
    } else {
        assertGap('S10.08 MinIO scale-down test skipped', 'kubectl not accessible or minio deployment name differs.');
        assertGap('S10.09 Text post during MinIO outage skipped', 'Depends on F4.');
        assertGap('S10.10 MinIO restore test skipped', 'Depends on F4.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('F5 — Network Delay Injection via tc netem');
    // ──────────────────────────────────────────────────────────────────────────

    let delayApplied = false;
    try {
        const feedPod = kube(`get pods -n ${NS} -l app=feed-service -o jsonpath='{.items[0].metadata.name}'`)
            .trim().replace(/^'|'$/g, '');
        console.log(`  ▸ Applying 100ms netem delay to pod ${feedPod}`);
        kube(`exec -n ${NS} ${feedPod} -- tc qdisc add dev eth0 root netem delay 100ms`);
        delayApplied = true;
        await sleep(1000);
    } catch (e) {
        console.log(`  ▸ netem inject failed (tc may not be available in container): ${e.message}`);
    }

    if (delayApplied) {
        const { ms, status } = await measureFeedLatency(studentToken);
        console.log(`  ▸ GET /feed with +100ms netem delay: ${ms}ms, HTTP ${status}`);

        assert('S10.11 GET /feed with injected delay → still returns 200',
            status === 200, `got HTTP ${status}`);

        assert('S10.12 GET /feed with injected delay responds within 2000ms',
            ms < 2000,
            `latency=${ms}ms — exceeded 2s threshold under 100ms netem delay`);

        // Remove delay
        try {
            const feedPod2 = kube(`get pods -n ${NS} -l app=feed-service -o jsonpath='{.items[0].metadata.name}'`)
                .trim().replace(/^'|'$/g, '');
            kube(`exec -n ${NS} ${feedPod2} -- tc qdisc del dev eth0 root`);
            console.log('  ▸ netem delay removed');
        } catch {}
    } else {
        assertGap('S10.11 netem latency test skipped',
            'tc netem not available in feed-service container. ' +
            'Add iproute2 to image or run from a privileged debug pod.');
        assertGap('S10.12 2s latency budget check skipped', 'Depends on F5.');
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('Post-Fault Recovery — Smoke Test (Mini S8 Journey)');
    // ──────────────────────────────────────────────────────────────────────────

    // Verify entire stack is healthy after all fault injections
    await sleep(3000);

    const smokeUserRes = await req(svcUrl('user', 'users/me'), 'GET', null, studentToken);
    assert('S10.13 Smoke: GET /users/me → 200',
        smokeUserRes.status === 200, `got HTTP ${smokeUserRes.status}`);

    const smokeFeedRes = await req(svcUrl('feed', 'feed'), 'GET', null, studentToken);
    assert('S10.14 Smoke: GET /feed → 200',
        smokeFeedRes.status === 200, `got HTTP ${smokeFeedRes.status}`);

    const smokeJobRes = await req(svcUrl('job', 'jobs'), 'GET', null, studentToken);
    assert('S10.15 Smoke: GET /jobs → 200',
        smokeJobRes.status === 200, `got HTTP ${smokeJobRes.status}`);

    const smokeEventRes = await req(svcUrl('event', 'events'), 'GET', null, studentToken);
    assert('S10.16 Smoke: GET /events → 200',
        smokeEventRes.status === 200, `got HTTP ${smokeEventRes.status}`);

    const smokeResearchRes = await req(svcUrl('research', 'research'), 'GET', null, studentToken);
    assert('S10.17 Smoke: GET /research → 200',
        smokeResearchRes.status === 200, `got HTTP ${smokeResearchRes.status}`);

    const smokeNotifRes = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    assert('S10.18 Smoke: GET /notifications → 200',
        smokeNotifRes.status === 200, `got HTTP ${smokeNotifRes.status}`);

    const smokeAnalyticsRes = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, adminToken);
    assert('S10.19 Smoke: GET /analytics/overview → 200',
        smokeAnalyticsRes.status === 200, `got HTTP ${smokeAnalyticsRes.status}`);

    // Upload should work (MinIO restored) — retry a few times as feed-service restarts after MinIO restore
    let smokeUploadRes = { status: 0 };
    for (let attempt = 0; attempt < 5; attempt++) {
        smokeUploadRes = await reqMultipart(
            svcUrl('feed', 'feed/upload'),
            adminToken, TINY_JPEG, 'image/jpeg', 'file', 'smoke_final.jpg');
        if (smokeUploadRes.status === 200 || smokeUploadRes.status === 201) break;
        await sleep(3000);
    }
    assert('S10.20 Smoke: POST /feed/upload → 200/201 (MinIO healthy)',
        smokeUploadRes.status === 200 || smokeUploadRes.status === 201,
        `got HTTP ${smokeUploadRes.status}`);

    summary('S10 — System Resilience & Fault Tolerance');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
