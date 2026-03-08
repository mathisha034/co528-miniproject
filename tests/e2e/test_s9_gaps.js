/**
 * test_s9_gaps.js  —  Unit test for S9 gap implementation
 *
 * Tests the 1 S9 gap in isolation:
 *   G9.1: GET /feed/:id returns the individual post document
 *         - 200 with full post body (content, userId, likes, likeCount)
 *         - Invalid ID → 400/404
 *         - Unknown valid ID → 404
 *         - likeCount matches likes.length after concurrent likes
 *
 * This is a STANDALONE test — it does NOT modify test_s9.js.
 * Run individually:  node tests/e2e/test_s9_gaps.js
 *
 * Prerequisites: setup_personas.sh must have been run.
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, getUserId, svcUrl,
} = require('./shared');

async function main() {
    banner('S9-GAPS — Feed Service: GET /feed/:id single-post retrieval');

    // ──────────────────────────────────────────────────────────────────────────
    section('Setup — Load tokens');
    // ──────────────────────────────────────────────────────────────────────────
    const alumniToken  = loadToken('.e2e_alumni_token');
    const studentToken = loadToken('.e2e_student_token');
    const alumniId     = getUserId(alumniToken);
    const ts           = Date.now();

    // ──────────────────────────────────────────────────────────────────────────
    section('G9.1 — GET /feed/:id returns the individual post');
    // ──────────────────────────────────────────────────────────────────────────

    // Create a post to test against
    const createRes = await req(svcUrl('feed', 'feed'), 'POST', {
        content: `G9.1 test post [${ts}] — single post retrieval`,
    }, alumniToken);

    assert('G9.1.1 POST /feed → 201 (create test post)',
        createRes.status === 201 || createRes.status === 200,
        `HTTP ${createRes.status}: ${JSON.stringify(createRes.body)}`);

    const postId = createRes.body?._id || createRes.body?.id;
    assert('G9.1.2 Created post has _id', !!postId, JSON.stringify(createRes.body));

    // Retrieve by ID
    const getRes = await req(svcUrl('feed', `feed/${postId}`), 'GET', null, studentToken);
    assert('G9.1.3 GET /feed/:id → 200 (G9.1)',
        getRes.status === 200,
        `HTTP ${getRes.status}: ${JSON.stringify(getRes.body)}`);

    console.log(`  ▸ GET /feed/${postId} body: ${JSON.stringify(getRes.body)?.substring(0, 100)}`);

    assert('G9.1.4 Response _id matches requested post',
        (getRes.body?._id || getRes.body?.id) === postId,
        `_id=${getRes.body?._id}`);

    assert('G9.1.5 Response has content field',
        !!getRes.body?.content,
        `body=${JSON.stringify(getRes.body)}`);

    assert('G9.1.6 Content matches what was posted',
        getRes.body?.content?.includes('G9.1 test post'),
        `content="${getRes.body?.content}"`);

    assert('G9.1.7 Response has userId field',
        !!getRes.body?.userId,
        `body=${JSON.stringify(getRes.body)}`);

    assert('G9.1.8 userId matches the post creator (alumni)',
        getRes.body?.userId === alumniId,
        `userId=${getRes.body?.userId} expected=${alumniId}`);

    assert('G9.1.9 Response has likes array (or likeCount)',
        Array.isArray(getRes.body?.likes) || typeof getRes.body?.likeCount === 'number',
        `body=${JSON.stringify(getRes.body)}`);

    // Like the post and verify likeCount via GET /feed/:id
    const likeRes = await req(
        svcUrl('feed', `feed/${postId}/like`), 'POST', null, studentToken);
    assert('G9.1.10 POST /feed/:id/like → 200',
        likeRes.status === 200 || likeRes.status === 201,
        `HTTP ${likeRes.status}`);

    const afterLikeRes = await req(svcUrl('feed', `feed/${postId}`), 'GET', null, studentToken);
    assert('G9.1.11 GET /feed/:id after like → 200',
        afterLikeRes.status === 200,
        `HTTP ${afterLikeRes.status}`);

    const likeCount = afterLikeRes.body?.likeCount ??
        (Array.isArray(afterLikeRes.body?.likes) ? afterLikeRes.body.likes.length : -1);
    assert('G9.1.12 likeCount = 1 after single like (G9.1)',
        likeCount === 1,
        `likeCount=${likeCount} body=${JSON.stringify(afterLikeRes.body)}`);

    // Idempotency: like again → still 1
    await req(svcUrl('feed', `feed/${postId}/like`), 'POST', null, studentToken);
    const afterDupeLikeRes = await req(svcUrl('feed', `feed/${postId}`), 'GET', null, studentToken);
    const likeCountAfterDupe = afterDupeLikeRes.body?.likeCount ??
        (Array.isArray(afterDupeLikeRes.body?.likes) ? afterDupeLikeRes.body.likes.length : -1);
    assert('G9.1.13 likeCount remains 1 after duplicate like (idempotency)',
        likeCountAfterDupe === 1,
        `likeCount=${likeCountAfterDupe}`);

    // Non-existent valid ObjectId → 404
    const fakeId = '000000000000000000000001';
    const notFoundRes = await req(svcUrl('feed', `feed/${fakeId}`), 'GET', null, studentToken);
    assert('G9.1.14 GET /feed/:id with unknown valid ID → 404',
        notFoundRes.status === 404,
        `HTTP ${notFoundRes.status}`);

    // Malformed ID → 400 or 404
    const badIdRes = await req(svcUrl('feed', 'feed/not-an-objectid'), 'GET', null, studentToken);
    assert('G9.1.15 GET /feed/:id with invalid ObjectId → 400 or 404',
        badIdRes.status === 400 || badIdRes.status === 404,
        `HTTP ${badIdRes.status}`);

    // Auth guard: unauthenticated → 401
    const unauthRes = await req(svcUrl('feed', `feed/${postId}`), 'GET', null, null);
    assert('G9.1.16 GET /feed/:id without token → 401',
        unauthRes.status === 401,
        `HTTP ${unauthRes.status}`);

    summary('S9-GAPS — Feed Service Gap Implementation (G9.1)');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
