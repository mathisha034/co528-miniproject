/**
 * test_s5_gaps.js  —  Unit tests for S5 gap implementations
 *
 * Tests both S5 gaps in isolation:
 *   G5.1: POST /research/:id/documents response includes file size (byte count)
 *         stored after successful MinIO upload — proves the MinIO round-trip happened.
 *   G5.2: POST /research/:id/documents to an ARCHIVED project → 400 Bad Request
 *         (check happens before MinIO, so it works even when MinIO is unavailable)
 *
 * This is a STANDALONE test — it does NOT modify test_s5.js.
 * Run individually:  node tests/e2e/test_s5_gaps.js
 *
 * Prerequisites: setup_personas.sh must have been run.
 */

'use strict';

const {
    req, reqMultipart, assert, section, banner, summary,
    loadToken, getUserId, svcUrl, sleep, TINY_JPEG,
} = require('./shared');

async function main() {
    banner('S5-GAPS — Research Service: document size field & archived upload block');

    // ──────────────────────────────────────────────────────────────────────────
    section('Setup — Load tokens');
    // ──────────────────────────────────────────────────────────────────────────
    const studentToken = loadToken('.e2e_student_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const studentId    = getUserId(studentToken);
    const alumniId     = getUserId(alumniToken);

    const ts = Date.now();

    // ──────────────────────────────────────────────────────────────────────────
    section('G5.2 — Archived project blocks document upload (no MinIO dependency)');
    // ──────────────────────────────────────────────────────────────────────────
    // Test G5.2 first because it doesn't depend on MinIO being available.

    const archProjRes = await req(svcUrl('research', 'research'), 'POST', {
        title:       `Archive Upload Block Test [${ts}]`,
        description: 'G5.2: upload to archived project must return 400',
        tags:        ['test'],
    }, studentToken);

    assert('G5.2.1 Student: POST /research → 201/200',
        archProjRes.status === 201 || archProjRes.status === 200,
        `got HTTP ${archProjRes.status}: ${JSON.stringify(archProjRes.body)}`);

    const archProjId = archProjRes.body?._id || archProjRes.body?.id;
    assert('G5.2.2 Project has _id', !!archProjId,
        `body: ${JSON.stringify(archProjRes.body)}`);

    // Archive the project
    const archiveRes = await req(svcUrl('research', `research/${archProjId}`), 'PATCH',
        { status: 'archived' }, studentToken);
    assert('G5.2.3 PATCH /research/:id status to "archived" → 200',
        archiveRes.status === 200,
        `got HTTP ${archiveRes.status}: ${JSON.stringify(archiveRes.body)}`);
    assert('G5.2.4 Project status is now "archived"',
        archiveRes.body?.status === 'archived',
        `status=${archiveRes.body?.status}`);

    // Upload to archived project — must be rejected with 400
    const uploadToArchived = await reqMultipart(
        svcUrl('research', `research/${archProjId}/documents`),
        studentToken, TINY_JPEG, 'image/jpeg', 'file', 'blocked.pdf');
    console.log(`  ▸ POST /documents on archived project → HTTP ${uploadToArchived.status}`);

    assert('G5.2.5 POST /research/:id/documents on ARCHIVED project → 400 (G5.2)',
        uploadToArchived.status === 400,
        `got HTTP ${uploadToArchived.status}: ${JSON.stringify(uploadToArchived.body)}`);

    if (uploadToArchived.status === 400) {
        console.log(`  ▸ error message: "${uploadToArchived.body?.message}"`);
    }

    // Collaborator also blocked from uploading to archived project
    // First invite alumni to the project (re-activate it temporarily? No, invite on archived is fine)
    await req(svcUrl('research', `research/${archProjId}/invite`), 'POST',
        { userId: alumniId }, studentToken);
    const collabUploadToArchived = await reqMultipart(
        svcUrl('research', `research/${archProjId}/documents`),
        alumniToken, TINY_JPEG, 'image/jpeg', 'file', 'collab_blocked.pdf');
    assert('G5.2.6 Collaborator POST /documents on ARCHIVED project → 400 (G5.2)',
        collabUploadToArchived.status === 400,
        `got HTTP ${collabUploadToArchived.status}: ${JSON.stringify(collabUploadToArchived.body)}`);

    // Verify active project still accepts uploads (G5.2 only blocks archived, not active/completed)
    const activeProjRes = await req(svcUrl('research', 'research'), 'POST', {
        title:       `Active Upload Test [${ts}]`,
        description: 'G5.2: active project should still accept uploads',
    }, studentToken);
    assert('G5.2.7 Create active project → 201/200',
        activeProjRes.status === 201 || activeProjRes.status === 200,
        `HTTP ${activeProjRes.status}`);
    const activeProjId = activeProjRes.body?._id || activeProjRes.body?.id;

    // ──────────────────────────────────────────────────────────────────────────
    section('G5.1 — Document record includes file size after successful MinIO upload');
    // ──────────────────────────────────────────────────────────────────────────
    // Use the active project created above.
    // Note: if MinIO is unavailable this test will fail with 503 — that is expected
    // (the gap can only be verified when MinIO is healthy).

    const uploadRes = await reqMultipart(
        svcUrl('research', `research/${activeProjId}/documents`),
        studentToken, TINY_JPEG, 'image/jpeg', 'file', 'review.pdf');
    console.log(`  ▸ POST /research/${activeProjId}/documents → HTTP ${uploadRes.status}`);

    if (uploadRes.status === 503) {
        console.log('  ⚠ MinIO unavailable (503) — G5.1 assertions skipped (infrastructure issue)');
        console.log('    G5.1 logic is still implemented in service; rerun when MinIO is healthy.');
        // Still record it as infrastructure-blocked, not a code failure
        assert('G5.1.0 POST /research/:id/documents (MinIO availability check)',
            false,
            'MinIO returned 503 — document storage unavailable. G5.1 requires MinIO to validate size field.');
    } else {
        assert('G5.1.1 POST /research/:id/documents → 200/201',
            uploadRes.status === 200 || uploadRes.status === 201,
            `got HTTP ${uploadRes.status}: ${JSON.stringify(uploadRes.body)}`);

        const docs = uploadRes.body?.documents;
        const lastDoc = Array.isArray(docs) ? docs[docs.length - 1] : null;

        assert('G5.1.2 Upload response includes documents[] array',
            Array.isArray(docs),
            `body keys: ${JSON.stringify(Object.keys(uploadRes.body || {}))}`);

        assert('G5.1.3 Last document has name field',
            !!(lastDoc?.name || lastDoc?.originalName),
            `lastDoc: ${JSON.stringify(lastDoc)}`);

        assert('G5.1.4 Last document record includes size field (G5.1)',
            typeof lastDoc?.size === 'number',
            `lastDoc: ${JSON.stringify(lastDoc)}`);

        assert('G5.1.5 Document size > 0 — confirms MinIO upload succeeded (G5.1)',
            typeof lastDoc?.size === 'number' && lastDoc.size > 0,
            `size=${lastDoc?.size}`);

        console.log(`  ▸ Document "${lastDoc?.name}" size=${lastDoc?.size} bytes`);

        // Second upload — sizes should be stored independently per document
        const upload2 = await reqMultipart(
            svcUrl('research', `research/${activeProjId}/documents`),
            studentToken, TINY_JPEG, 'image/jpeg', 'file', 'appendix.pdf');
        assert('G5.1.6 Second upload → 200/201',
            upload2.status === 200 || upload2.status === 201,
            `HTTP ${upload2.status}`);

        const docs2 = upload2.body?.documents || [];
        const doc2 = docs2[docs2.length - 1];
        assert('G5.1.7 Second document also has size > 0 (G5.1)',
            typeof doc2?.size === 'number' && doc2.size > 0,
            `size=${doc2?.size}`);

        // Verify size persists in GET /research/:id
        const projDetail = await req(svcUrl('research', `research/${activeProjId}`), 'GET', null, studentToken);
        const storedDocs = projDetail.body?.documents || [];
        const allHaveSize = storedDocs.length > 0 && storedDocs.every(d => typeof d.size === 'number' && d.size > 0);
        assert('G5.1.8 All documents in GET /research/:id have size > 0 (persisted in MongoDB)',
            allHaveSize,
            `docs: ${JSON.stringify(storedDocs.map(d => ({ name: d.name, size: d.size })))}`);

        // Verify size also appears in GET /research/:id/documents
        const listRes = await req(svcUrl('research', `research/${activeProjId}/documents`), 'GET', null, studentToken);
        const listedDocs = Array.isArray(listRes.body) ? listRes.body : listRes.body?.documents || [];
        const listedHaveSize = listedDocs.length > 0 && listedDocs.every(d => typeof d.size === 'number');
        assert('G5.1.9 GET /research/:id/documents — all listed documents include size field',
            listedHaveSize,
            `listedDocs: ${JSON.stringify(listedDocs.map(d => ({ name: d.name, size: d.size })))}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('G5.2 — additional edge cases');
    // ──────────────────────────────────────────────────────────────────────────

    // completed project should still accept uploads (only ARCHIVED is blocked)
    const completedProjRes = await req(svcUrl('research', 'research'), 'POST', {
        title:       `Completed Upload Test [${ts}]`,
        description: 'G5.2: completed project should still accept uploads',
    }, studentToken);
    const completedProjId = completedProjRes.body?._id || completedProjRes.body?.id;

    if (completedProjId) {
        await req(svcUrl('research', `research/${completedProjId}`), 'PATCH',
            { status: 'completed' }, studentToken);

        // Upload to completed project — should NOT be blocked by G5.2
        const uploadToCompleted = await reqMultipart(
            svcUrl('research', `research/${completedProjId}/documents`),
            studentToken, TINY_JPEG, 'image/jpeg', 'file', 'completed_doc.pdf');
        assert('G5.2.8 POST /documents on COMPLETED project → 200/201/503 (not 400)',
            uploadToCompleted.status !== 400,
            `got HTTP ${uploadToCompleted.status} — "completed" projects should not be blocked, only "archived"`);
    }

    summary('S5-GAPS — Research Service Gap Implementations (G5.1–G5.2)');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
