#!/usr/bin/env node
/**
 * S9 — Concurrent Platform Activity (Stress / Concurrency)
 * ==========================================================
 * Fires multiple parallel requests to verify:
 *  - No duplicate resources created from idempotent operations
 *  - Concurrent reads return consistent data
 *  - No 5xx under moderate parallel load
 *  - Like-idempotency under concurrent likes
 *
 * Services: feed, job, event, analytics, notification
 *
 * Run: node tests/e2e/test_s9.js
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, getUserId, svcUrl, sleep,
} = require('./shared');

/** Fire n concurrent copies of the same request */
async function parallel(n, fn) {
    return Promise.all(Array.from({ length: n }, () => fn()));
}

async function main() {
    banner('S9 — Concurrent Platform Activity');

    const studentToken = loadToken('.e2e_student_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const adminToken   = loadToken('.e2e_admin_token');
    const studentId    = getUserId(studentToken);

    const ts = Date.now();

    // ──────────────────────────────────────────────────────────────────────────
    section('S9 · T1 — Five Sequential Feed Posts (unique content)');
    // ──────────────────────────────────────────────────────────────────────────

    // Create 5 posts in parallel from alumni
    const postResults = await parallel(5, (i => () =>
        req(svcUrl('feed', 'feed'), 'POST', {
            content: `S9 Concurrent post #${i} [${ts}]`,
        }, alumniToken)
    )(Math.random()));

    const successCreates = postResults.filter(r => r.status === 201 || r.status === 200);
    assert('S9.1  5 parallel POST /feed requests → all 200/201',
        successCreates.length === 5,
        `only ${successCreates.length}/5 succeeded. Statuses: ${postResults.map(r => r.status).join(',')}`);

    const postIds = postResults.map(r => r.body?._id || r.body?.id).filter(Boolean);
    const uniquePostIds = new Set(postIds);
    assert('S9.2  All 5 created posts have unique _ids (no deduplication)',
        uniquePostIds.size === postIds.length,
        `created ${postIds.length} posts but only ${uniquePostIds.size} unique IDs`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S9 · T2 — Ten Parallel GET /feed (Cache Consistency)');
    // ──────────────────────────────────────────────────────────────────────────

    await sleep(500); // let writes propagate to Redis cache

    const feedReads = await parallel(10, () =>
        req(svcUrl('feed', 'feed'), 'GET', null, studentToken));

    const feed200s = feedReads.filter(r => r.status === 200);
    assert('S9.3  10 parallel GET /feed → all 200 OK',
        feed200s.length === 10,
        `only ${feed200s.length}/10 returned 200. Statuses: ${feedReads.map(r => r.status).join(',')}`);

    // All responses should contain the same data (consistent cache)
    const counts = feedReads.map(r => {
        const body = r.body;
        return Array.isArray(body) ? body.length : (body?.posts?.length ?? -1);
    });
    const allSameCount = counts.every(c => c === counts[0]);
    assert('S9.4  All 10 concurrent GET /feed responses have identical post count',
        allSameCount,
        `counts differ: ${counts.join(',')}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S9 · T3 — Five Parallel GET /analytics/overview');
    // ──────────────────────────────────────────────────────────────────────────

    const analyticsReads = await parallel(5, () =>
        req(svcUrl('analytics', 'analytics/overview'), 'GET', null, adminToken));

    const analytics200s = analyticsReads.filter(r => r.status === 200);
    assert('S9.5  5 parallel GET /analytics/overview → all 200',
        analytics200s.length === 5,
        `only ${analytics200s.length}/5. Statuses: ${analyticsReads.map(r => r.status).join(',')}`);

    // Counts should be consistent across all responses
    const overviewUsers = analyticsReads.map(r => r.body?.users);
    const allSameUsers = overviewUsers.every(u => u === overviewUsers[0]);
    assert('S9.6  All 5 concurrent overview responses agree on users count',
        allSameUsers,
        `users counts diverge: ${overviewUsers.join(',')}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S9 · T4 — Concurrent Like (Idempotency Under Race)');
    // ──────────────────────────────────────────────────────────────────────────

    // Pick the first post from T1
    const targetPostId = postIds[0];

    if (targetPostId) {
        // Fire 5 concurrent likes from student on the same post
        const likeResults = await parallel(5, () =>
            req(svcUrl('feed', `feed/${targetPostId}/like`), 'POST', null, studentToken));

        const like200s = likeResults.filter(r => r.status === 200 || r.status === 201);
        const like409s = likeResults.filter(r => r.status === 409 || r.status === 400);
        // Idempotency: exactly 1 succeeds, rest 409/400 (or all 200 if idempotent)
        assert('S9.7  Concurrent likes: at least 1 succeeds (200/201)',
            like200s.length >= 1,
            `0 successful likes. Statuses: ${likeResults.map(r => r.status).join(',')}`);

        console.log(`  ▸ Concurrent likes: ${like200s.length} accepted, ${like409s.length} duplicate-rejected (${likeResults.map(r => r.status).join(',')})`);

        // likeCount should reflect exactly 1 like
        const postDetailRes = await req(svcUrl('feed', `feed/${targetPostId}`), 'GET', null, studentToken);
        if (postDetailRes.status === 200) {
            const likeCount = postDetailRes.body?.likeCount ?? postDetailRes.body?.likes?.length ?? -1;
            assert('S9.8  Post like count = 1 after concurrent like attempts by same user',
                likeCount === 1,
                `likeCount=${likeCount}`);
        } else {
            assert('S9.8  GET /feed/:id → 200 (G9.1 implemented)',
                false,
                `GET /feed/:id returned ${postDetailRes.status} — expected 200`);
        }
    } else {
        assert('S9.7  Concurrent likes: at least 1 succeeds — no post ID from T1', false, 'T1 produced no post IDs');
        assert('S9.8  Post like count check — no post ID from T1', false, 'T1 produced no post IDs');
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('S9 · T5 — Concurrent Job Listing Reads');
    // ──────────────────────────────────────────────────────────────────────────

    const jobReads = await parallel(8, () =>
        req(svcUrl('job', 'jobs'), 'GET', null, studentToken));

    const job200s = jobReads.filter(r => r.status === 200);
    assert('S9.9  8 parallel GET /jobs → all 200',
        job200s.length === 8,
        `only ${job200s.length}/8. Statuses: ${jobReads.map(r => r.status).join(',')}`);

    const jobCounts = jobReads.map(r =>
        Array.isArray(r.body) ? r.body.length : (r.body?.jobs?.length ?? -1));
    const allSameJobCount = jobCounts.every(c => c === jobCounts[0]);
    assert('S9.10 All 8 concurrent GET /jobs responses have same item count',
        allSameJobCount,
        `job counts: ${jobCounts.join(',')}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S9 · T6 — Concurrent Event Reads + One RSVP');
    // ──────────────────────────────────────────────────────────────────────────

    const eventReads = await parallel(20, () =>
        req(svcUrl('event', 'events'), 'GET', null, studentToken));

    const event200s = eventReads.filter(r => r.status === 200);
    assert('S9.11 20 parallel GET /events → all 200',
        event200s.length === 20,
        `only ${event200s.length}/20. Statuses: ${eventReads.map(r => r.status).join(',')}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S9 · T7 — Concurrent Notification Reads');
    // ──────────────────────────────────────────────────────────────────────────

    const notifReads = await parallel(5, () =>
        req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken));

    const notif200s = notifReads.filter(r => r.status === 200);
    assert('S9.12 5 parallel GET /notifications → all 200',
        notif200s.length === 5,
        `only ${notif200s.length}/5. Statuses: ${notifReads.map(r => r.status).join(',')}`);

    const notifCounts = notifReads.map(r =>
        Array.isArray(r.body) ? r.body.length : (r.body?.notifications?.length ?? -1));
    const allSameNotifs = notifCounts.every(c => c === notifCounts[0]);
    assert('S9.13 Concurrent notification reads return consistent data',
        allSameNotifs,
        `notif counts: ${notifCounts.join(',')}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S9 · T8 — No 5xx Under Load Summary Check');
    // ──────────────────────────────────────────────────────────────────────────

    // Collect all responses from above and verify no 5xx
    const allResponses = [
        ...postResults, ...feedReads, ...analyticsReads, ...jobReads, ...eventReads, ...notifReads,
    ];
    const server5xxs = allResponses.filter(r => r.status >= 500);
    assert('S9.14 No 5xx server errors observed across all concurrent requests',
        server5xxs.length === 0,
        `${server5xxs.length} 5xx errors: ${server5xxs.map(r => r.status).slice(0,5).join(',')}`);

    summary('S9 — Concurrent Platform Activity');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
