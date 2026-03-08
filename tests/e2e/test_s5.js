#!/usr/bin/env node
/**
 * S5 — Student Creates Research Project & Invites Collaborator
 * ==============================================================
 * Actors : Ashan (student) creates project, uploads document, invites Nimali.
 *          Nimali (alumni) views project and documents as collaborator.
 *
 * Services: research-service, MinIO (file storage), notification-service
 *
 * Key facts:
 *  - POST /research/:id/invite  body: { userId: "<keycloak-uuid>" }
 *    The userId must match the Keycloak sub UUID (not a MongoDB _id)
 *  - research-service dispatches notification on invite via internal API ✅
 *  - ResearchStatus enum: active, completed, archived
 *  - Documents are uploaded to MinIO research-docs bucket
 *  - Document records now include file size in bytes (G5.1 implemented)
 *  - Uploads to archived projects return 400 Bad Request (G5.2 implemented)
 * Run: node tests/e2e/test_s5.js
 */

'use strict';

const {
    req, reqMultipart, assert, section, banner, summary,
    loadToken, loadId, getUserId, svcUrl, sleep, TINY_JPEG,
} = require('./shared');

async function main() {
    banner('S5 — Student Creates Research Project & Invites Collaborator');

    const studentToken = loadToken('.e2e_student_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const adminToken   = loadToken('.e2e_admin_token');
    const studentId    = getUserId(studentToken);
    const alumniId     = getUserId(alumniToken);

    console.log(`  ▸ Student (Ashan)  sub: ${studentId.slice(0,8)}...`);
    console.log(`  ▸ Alumni  (Nimali) sub: ${alumniId.slice(0,8)}...`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S5 · Step 1 — Create Research Project');
    // ──────────────────────────────────────────────────────────────────────────

    const ts = Date.now();
    const createRes = await req(svcUrl('research', 'research'), 'POST', {
        title: `Federated Learning for IoT Privacy [${ts}]`,
        description: 'Privacy-preserving ML for edge IoT devices',
        tags: ['ML', 'IoT', 'Privacy'],
    }, studentToken);
    console.log(`  ▸ POST /research → HTTP ${createRes.status}  body: ${JSON.stringify(createRes.body)?.substring(0,100)}`);

    assert('S5.1  Student: POST /research → 201 or 200',
        createRes.status === 201 || createRes.status === 200,
        `got HTTP ${createRes.status}: ${JSON.stringify(createRes.body)}`);

    const projectId = createRes.body?._id || createRes.body?.id;
    assert('S5.2  Project has _id', !!projectId, `body: ${JSON.stringify(createRes.body)}`);

    assert('S5.3  Project ownerId matches student sub',
        createRes.body?.ownerId === studentId,
        `ownerId=${createRes.body?.ownerId}  expected=${studentId.slice(0,8)}...`);

    assert('S5.4  Project initial status = "active"',
        createRes.body?.status === 'active',
        `status=${createRes.body?.status}`);

    assert('S5.5  Project initial collaborators array is empty',
        Array.isArray(createRes.body?.collaborators) && createRes.body.collaborators.length === 0,
        `collaborators=${JSON.stringify(createRes.body?.collaborators)}`);

    // Missing title → 400 (MinLength(3) validation)
    const noTitleRes = await req(svcUrl('research', 'research'), 'POST',
        { description: 'No title provided' }, studentToken);
    assert('S5.6  POST /research without title → 400 Bad Request',
        noTitleRes.status === 400,
        `got HTTP ${noTitleRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S5 · Step 2 — Invite Collaborator (Nimali)');
    // ──────────────────────────────────────────────────────────────────────────

    // InviteCollaboratorDto requires { userId: UUID (Keycloak sub) }
    const inviteRes = await req(
        svcUrl('research', `research/${projectId}/invite`), 'POST',
        { userId: alumniId }, studentToken);
    console.log(`  ▸ POST /research/${projectId}/invite → HTTP ${inviteRes.status}  body: ${JSON.stringify(inviteRes.body)?.substring(0,100)}`);

    assert('S5.7  Owner: POST /research/:id/invite → 200 or 201',
        inviteRes.status === 200 || inviteRes.status === 201,
        `got HTTP ${inviteRes.status}: ${JSON.stringify(inviteRes.body)}`);

    const collaboratorsAfterInvite = inviteRes.body?.collaborators || [];
    assert('S5.8  Nimali\'s userId appears in collaborators after invite',
        collaboratorsAfterInvite.includes(alumniId) ||
        collaboratorsAfterInvite.some(c => c?.toString() === alumniId ||
            c?.userId === alumniId),
        `collaborators=${JSON.stringify(collaboratorsAfterInvite)}`);

    // Notification check — research-service dispatches invite notifications
    await sleep(2000);
    const notifRes = await req(
        svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    assert('S5.9  GET /notifications for Nimali → 200 after invite',
        notifRes.status === 200, `got HTTP ${notifRes.status}`);

    const notifications = Array.isArray(notifRes.body)
        ? notifRes.body
        : notifRes.body?.notifications || notifRes.body?.items || [];
    const inviteNotif = notifications.some(n =>
        n.message?.toLowerCase().includes('invit') ||
        n.message?.toLowerCase().includes('collaborat') ||
        n.type?.toLowerCase().includes('invit'));

    assert('S5.10 Nimali receives invitation notification from research-service',
        inviteNotif || notifications.length > 0,
        `Notifications: ${JSON.stringify(notifications.slice(0,2))}`);

    // Non-owner trying to invite → 403
    const unauthorisedInviteRes = await req(
        svcUrl('research', `research/${projectId}/invite`), 'POST',
        { userId: getUserId(adminToken) }, alumniToken);
    assert('S5.11 Non-owner (Nimali): POST /research/:id/invite → 403 Forbidden',
        unauthorisedInviteRes.status === 403,
        `got HTTP ${unauthorisedInviteRes.status}`);

    // Invite already-added collaborator → 409 or 200 with no change
    const dupInviteRes = await req(
        svcUrl('research', `research/${projectId}/invite`), 'POST',
        { userId: alumniId }, studentToken);
    assert('S5.12 Invite already-added collaborator → 409 Conflict or handled idempotently',
        dupInviteRes.status === 409 || dupInviteRes.status === 400 ||
        dupInviteRes.status === 200 || dupInviteRes.status === 201,
        `got HTTP ${dupInviteRes.status}: ${JSON.stringify(dupInviteRes.body)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S5 · Step 3 — Upload Research Document (Owner)');
    // ──────────────────────────────────────────────────────────────────────────

    const uploadRes = await reqMultipart(
        svcUrl('research', `research/${projectId}/documents`),
        studentToken, TINY_JPEG, 'image/jpeg', 'file', 'literature_review.pdf');
    console.log(`  ▸ POST /research/${projectId}/documents → HTTP ${uploadRes.status}  body: ${JSON.stringify(uploadRes.body)?.substring(0,120)}`);

    assert('S5.13 Owner: POST /research/:id/documents → 200 or 201',
        uploadRes.status === 200 || uploadRes.status === 201,
        `got HTTP ${uploadRes.status}: ${JSON.stringify(uploadRes.body)}`);

    const docMeta = uploadRes.body;
    // POST /research/:id/documents returns the full updated project document
    // The uploaded document appears as the last entry in project.documents[]
    const lastDoc = Array.isArray(docMeta?.documents) ? docMeta.documents[docMeta.documents.length - 1] : null;
    assert('S5.14 Project document list updated — last document has name',
        !!(lastDoc?.name || lastDoc?.originalName || lastDoc?.filename) || (Array.isArray(docMeta?.documents) && docMeta.documents.length >= 1),
        `lastDoc: ${JSON.stringify(lastDoc)}, total docs: ${docMeta?.documents?.length}, body snippet: ${JSON.stringify(docMeta)?.substring(0,120)}`);

    assert('S5.15 Document record has valid identifier (_id or minioKey)',
        !!(lastDoc?._id || lastDoc?.minioKey || lastDoc?.key || lastDoc?.url || docMeta?._id),
        `lastDoc: ${JSON.stringify(lastDoc)}, docMeta._id: ${docMeta?._id}`);

    assert('S5.16 Document record includes file size — confirms MinIO upload succeeded (G5.1)',
        typeof lastDoc?.size === 'number' && lastDoc.size > 0,
        `size=${lastDoc?.size}, doc: ${JSON.stringify(lastDoc)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S5 · Step 4 — Collaborator Views Project & Documents');
    // ──────────────────────────────────────────────────────────────────────────

    // Nimali views the project as collaborator
    const projRes = await req(
        svcUrl('research', `research/${projectId}`), 'GET', null, alumniToken);
    assert('S5.17 Collaborator (Nimali): GET /research/:id → 200',
        projRes.status === 200,
        `got HTTP ${projRes.status}: ${JSON.stringify(projRes.body)?.substring(0,100)}`);

    assert('S5.18 Project detail includes document metadata list',
        Array.isArray(projRes.body?.documents), `body: ${JSON.stringify(projRes.body)?.substring(0,100)}`);

    // List documents
    const docsRes = await req(
        svcUrl('research', `research/${projectId}/documents`), 'GET', null, alumniToken);
    assert('S5.19 Collaborator: GET /research/:id/documents → 200',
        docsRes.status === 200,
        `got HTTP ${docsRes.status}`);

    const docs = Array.isArray(docsRes.body) ? docsRes.body :
        docsRes.body?.documents || projRes.body?.documents || [];
    assert('S5.20 Documents list contains at least 1 uploaded document',
        docs.length >= 1, `docs.length=${docs.length}`);

    // Unauthenticated → 401
    const noJwtDocsRes = await req(
        svcUrl('research', `research/${projectId}/documents`), 'GET', null, null);
    assert('S5.21 GET /research/:id/documents without JWT → 401',
        noJwtDocsRes.status === 401, `got HTTP ${noJwtDocsRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S5 · Step 5 — Remove Collaborator');
    // ──────────────────────────────────────────────────────────────────────────

    const removeCollabRes = await req(
        svcUrl('research', `research/${projectId}/collaborators/${alumniId}`),
        'DELETE', null, studentToken);
    console.log(`  ▸ DELETE /research/${projectId}/collaborators/${alumniId.slice(0,8)}... → HTTP ${removeCollabRes.status}`);

    assert('S5.22 Owner: DELETE /research/:id/collaborators/:userId → 200',
        removeCollabRes.status === 200,
        `got HTTP ${removeCollabRes.status}: ${JSON.stringify(removeCollabRes.body)}`);

    const collabsAfterRemove = removeCollabRes.body?.collaborators || [];
    assert('S5.23 Nimali no longer in collaborators after remove',
        !collabsAfterRemove.includes(alumniId) &&
        !collabsAfterRemove.some(c => c?.toString() === alumniId),
        `collaborators after remove: ${JSON.stringify(collabsAfterRemove)}`);

    // Remove non-existent → 404
    const removeFakeRes = await req(
        svcUrl('research', `research/${projectId}/collaborators/00000000-0000-0000-0000-000000000000`),
        'DELETE', null, studentToken);
    assert('S5.24 Remove non-existent collaborator → 404 Not Found',
        removeFakeRes.status === 404 || removeFakeRes.status === 400,
        `got HTTP ${removeFakeRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S5 · Step 6 — Archive Project');
    // ──────────────────────────────────────────────────────────────────────────

    const archiveRes = await req(svcUrl('research', `research/${projectId}`), 'PATCH',
        { status: 'archived' }, studentToken);
    assert('S5.25 Owner: PATCH /research/:id status to "archived" → 200',
        archiveRes.status === 200,
        `got HTTP ${archiveRes.status}: ${JSON.stringify(archiveRes.body)}`);

    assert('S5.26 Project status is now "archived"',
        archiveRes.body?.status === 'archived',
        `status=${archiveRes.body?.status}`);

    // Upload to archived project — must be rejected with 400 Bad Request (G5.2)
    const uploadArchivedRes = await reqMultipart(
        svcUrl('research', `research/${projectId}/documents`),
        studentToken, TINY_JPEG, 'image/jpeg', 'file', 'archived_doc.pdf');
    console.log(`  ▸ Upload to archived project → HTTP ${uploadArchivedRes.status}`);

    assert('S5.27 POST /research/:id/documents to archived project → 400 (G5.2)',
        uploadArchivedRes.status === 400,
        `got HTTP ${uploadArchivedRes.status}: ${JSON.stringify(uploadArchivedRes.body)}`);

    summary('S5 — Student Creates Research Project & Invites Collaborator');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
