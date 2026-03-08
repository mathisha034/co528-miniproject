#!/usr/bin/env node
/**
 * S2-GAPS — Feed Service: MinIO Object Verification (G2.1)
 * =========================================================
 * Implements and tests the previously-skipped S2.13 assertion:
 *  "Verify file physically exists in MinIO posts bucket"
 *
 * Gap implemented: G2.1
 *  - MinioService.statObject() — calls client.statObject() and returns
 *    { exists, size, contentType } without throwing on miss.
 *  - FeedService.verifyImage()  — delegates to MinioService.statObject().
 *  - FeedController GET /feed/upload/verify?path=<objectPath>
 *    Returns the stat result; 400 if `path` is missing; 401 without JWT.
 *
 * Route safety: @Get('upload/verify') has two path segments — it cannot
 * collide with @Get(':id') (one segment) or @Get() (zero segments).
 *
 * Run: node tests/e2e/test_s2_gaps.js
 */

'use strict';

const {
    req, reqMultipart, assert, section, banner, summary,
    loadToken, svcUrl, TINY_JPEG,
} = require('./shared');

async function main() {
    banner('S2-GAPS — Feed Service: MinIO Object Verification (G2.1)');

    // ──────────────────────────────────────────────────────────────────────────
    section('Setup — Load tokens');
    // ──────────────────────────────────────────────────────────────────────────

    const alumniToken = loadToken('.e2e_alumni_token');

    // ──────────────────────────────────────────────────────────────────────────
    section('G2.1 — POST /feed/upload then verify object exists in MinIO');
    // ──────────────────────────────────────────────────────────────────────────

    // Step 1: Upload a JPEG image
    const uploadRes = await reqMultipart(
        svcUrl('feed', 'feed/upload'), alumniToken,
        TINY_JPEG, 'image/jpeg', 'file', 'gap_test.jpg');

    assert('G2.1.1  POST /feed/upload → 200 or 201',
        uploadRes.status === 200 || uploadRes.status === 201,
        `HTTP ${uploadRes.status}: ${JSON.stringify(uploadRes.body)}`);

    const imageUrl = uploadRes.body?.imageUrl || uploadRes.body?.url;
    assert('G2.1.2  Upload response contains imageUrl',
        typeof imageUrl === 'string' && imageUrl.length > 0,
        `body: ${JSON.stringify(uploadRes.body)}`);

    // Step 2: Parse the object path from the returned URL
    // URL format: http://minio:9000/<bucket>/<objectPath>
    // We strip everything up to and including "/<bucket>/" to get objectPath
    const BUCKET = 'miniproject';
    const bucketPrefix = `/${BUCKET}/`;
    const bucketIdx = imageUrl?.indexOf(bucketPrefix);
    const objectPath = bucketIdx >= 0 ? imageUrl.slice(bucketIdx + bucketPrefix.length) : null;

    console.log(`  ▸ imageUrl    : ${imageUrl}`);
    console.log(`  ▸ objectPath  : ${objectPath}`);

    assert('G2.1.3  objectPath parsed from imageUrl (starts with "posts/")',
        typeof objectPath === 'string' && objectPath.startsWith('posts/'),
        `objectPath="${objectPath}" from imageUrl="${imageUrl}"`);

    // Step 3: Verify the object exists via the new verification endpoint
    const verifyUrl = svcUrl('feed', `feed/upload/verify`) + `?path=${encodeURIComponent(objectPath)}`;
    const verifyRes = await req(verifyUrl, 'GET', null, alumniToken);
    console.log(`  ▸ GET /feed/upload/verify → HTTP ${verifyRes.status}  body: ${JSON.stringify(verifyRes.body)}`);

    assert('G2.1.4  GET /feed/upload/verify → 200 (endpoint reachable)',
        verifyRes.status === 200,
        `HTTP ${verifyRes.status}: ${JSON.stringify(verifyRes.body)}`);

    assert('G2.1.5  Verify response contains exists field',
        typeof verifyRes.body?.exists === 'boolean',
        `body: ${JSON.stringify(verifyRes.body)}`);

    assert('G2.1.6  exists = true (object is physically present in MinIO)',
        verifyRes.body?.exists === true,
        `exists=${verifyRes.body?.exists}`);

    assert('G2.1.7  size > 0 (object is not empty)',
        typeof verifyRes.body?.size === 'number' && verifyRes.body.size > 0,
        `size=${verifyRes.body?.size}`);

    assert('G2.1.8  contentType contains "image" (MIME matches upload)',
        typeof verifyRes.body?.contentType === 'string' &&
        verifyRes.body.contentType.includes('image'),
        `contentType="${verifyRes.body?.contentType}"`);

    // ──────────────────────────────────────────────────────────────────────────
    section('G2.1 — Error handling on verify endpoint');
    // ──────────────────────────────────────────────────────────────────────────

    // Non-existent object → exists: false (not a hard error)
    const missingRes = await req(
        svcUrl('feed', 'feed/upload/verify') + '?path=posts%2Fnonexistent-00000000-0000.jpeg',
        'GET', null, alumniToken);
    console.log(`  ▸ Verify non-existent → HTTP ${missingRes.status}  exists=${missingRes.body?.exists}`);

    assert('G2.1.9  Non-existent objectPath → 200 with exists=false',
        missingRes.status === 200 && missingRes.body?.exists === false,
        `HTTP ${missingRes.status} exists=${missingRes.body?.exists}`);

    // Missing path param → 400
    const noParamRes = await req(
        svcUrl('feed', 'feed/upload/verify'),
        'GET', null, alumniToken);
    console.log(`  ▸ Verify no path param → HTTP ${noParamRes.status}`);

    assert('G2.1.10 Missing path query param → 400 Bad Request',
        noParamRes.status === 400,
        `HTTP ${noParamRes.status}: ${JSON.stringify(noParamRes.body)}`);

    // Unauthenticated → 401
    const unauthRes = await req(
        svcUrl('feed', 'feed/upload/verify') + `?path=${encodeURIComponent(objectPath)}`,
        'GET', null, null);
    console.log(`  ▸ Verify unauthenticated → HTTP ${unauthRes.status}`);

    assert('G2.1.11 Unauthenticated verify request → 401',
        unauthRes.status === 401,
        `HTTP ${unauthRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('G2.1 — End-to-end: create image post then verify storage');
    // ──────────────────────────────────────────────────────────────────────────

    // Upload a second image, attach to a post, then verify its storage
    const upload2Res = await reqMultipart(
        svcUrl('feed', 'feed/upload'), alumniToken,
        TINY_JPEG, 'image/jpeg', 'file', 'gap_test2.jpg');
    const imageUrl2 = upload2Res.body?.imageUrl || upload2Res.body?.url;
    const bucketIdx2 = imageUrl2?.indexOf(bucketPrefix);
    const objectPath2 = bucketIdx2 >= 0 ? imageUrl2.slice(bucketIdx2 + bucketPrefix.length) : null;

    assert('G2.1.12 Second upload returns a different imageUrl (unique object keys)',
        imageUrl2 !== imageUrl,
        `imageUrl2=${imageUrl2} same as imageUrl1=${imageUrl}`);

    const ts = Date.now();
    const postRes = await req(svcUrl('feed', 'feed'), 'POST',
        { content: `G2.1 gap test post [${ts}]`, imageUrl: imageUrl2 }, alumniToken);

    assert('G2.1.13 POST /feed with imageUrl → 201 (post with image created)',
        postRes.status === 201 || postRes.status === 200,
        `HTTP ${postRes.status}: ${JSON.stringify(postRes.body)}`);

    const verify2Res = await req(
        svcUrl('feed', 'feed/upload/verify') + `?path=${encodeURIComponent(objectPath2)}`,
        'GET', null, alumniToken);

    assert('G2.1.14 Object from image post also exists in MinIO → exists=true',
        verify2Res.status === 200 && verify2Res.body?.exists === true,
        `HTTP ${verify2Res.status} exists=${verify2Res.body?.exists}`);

    summary('S2-GAPS — Feed Service: MinIO Object Verification (G2.1)');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
