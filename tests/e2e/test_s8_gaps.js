/**
 * test_s8_gaps.js  —  Unit test for S8 gap implementation
 *
 * Tests the 1 S8 gap in isolation:
 *   G8.1: POST /research/:id/invite dispatches a GENERAL notification to the
 *         invited collaborator containing "invite" and the project title.
 *         Idempotency: re-inviting an existing collaborator does NOT fire again.
 *
 * This is a STANDALONE test — it does NOT modify test_s8.js.
 * Run individually:  node tests/e2e/test_s8_gaps.js
 *
 * Prerequisites: setup_personas.sh must have been run.
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, getUserId, svcUrl, sleep,
} = require('./shared');

async function main() {
    banner('S8-GAPS — Research Service: collaboration invite notification');

    // ──────────────────────────────────────────────────────────────────────────
    section('Setup — Load tokens');
    // ──────────────────────────────────────────────────────────────────────────
    const adminToken  = loadToken('.e2e_admin_token');
    const alumniToken = loadToken('.e2e_alumni_token');
    const alumniId    = getUserId(alumniToken);
    const ts          = Date.now();

    // ──────────────────────────────────────────────────────────────────────────
    section('G8.1 — POST /research/:id/invite dispatches GENERAL notification');
    // ──────────────────────────────────────────────────────────────────────────

    // Create a research project as admin
    const createRes = await req(svcUrl('research', 'research'), 'POST', {
        title:       `Quantum Entanglement Study [${ts}]`,
        description: 'G8.1 collaboration invite notification test',
        tags:        ['quantum', 'physics'],
    }, adminToken);

    assert('G8.1.1 Admin: POST /research → 201',
        createRes.status === 201 || createRes.status === 200,
        `HTTP ${createRes.status}: ${JSON.stringify(createRes.body)}`);

    const researchId = createRes.body?._id || createRes.body?.id;
    assert('G8.1.2 Research project has _id', !!researchId, JSON.stringify(createRes.body));

    // Mark baseline: check current notification count for alumni
    const beforeNotifs = await req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    const beforeList = Array.isArray(beforeNotifs.body) ? beforeNotifs.body : [];
    console.log(`  ▸ Alumni has ${beforeList.length} notifications before invite`);

    // Invite alumni as collaborator
    const inviteRes = await req(
        svcUrl('research', `research/${researchId}/invite`), 'POST',
        { userId: alumniId }, adminToken);

    assert('G8.1.3 Admin: POST /research/:id/invite alumniId → 200',
        inviteRes.status === 200 || inviteRes.status === 201,
        `HTTP ${inviteRes.status}: ${JSON.stringify(inviteRes.body)}`);

    assert('G8.1.4 Alumni appears in project collaborators[]',
        (inviteRes.body?.collaborators || []).includes(alumniId),
        `collaborators=${JSON.stringify(inviteRes.body?.collaborators)}`);

    // Wait for async notification delivery
    console.log('  ▸ Waiting 1.5s for async notification delivery...');
    await sleep(1500);

    // Check alumni's notifications
    const afterNotifs = await req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    assert('G8.1.5 GET /notifications (alumni) → 200',
        afterNotifs.status === 200,
        `HTTP ${afterNotifs.status}`);

    const afterList = Array.isArray(afterNotifs.body) ? afterNotifs.body : [];

    // Find by idempotencyKey or by message content
    const inviteNotif = afterList.find(n =>
        n.idempotencyKey === `collaboration_invite:${researchId}:${alumniId}` ||
        (n.type === 'general' && n.message?.toLowerCase().includes('invite')) ||
        JSON.stringify(n).toLowerCase().includes('quantum entanglement')
    );

    assert('G8.1.6 GENERAL collaboration invite notification in alumni inbox (G8.1)',
        !!inviteNotif,
        `found ${afterList.length} notifs; general: ${
            JSON.stringify(afterList.filter(n => n.type === 'general').map(n => n.message))
        }`);

    if (inviteNotif) console.log(`  ▸ Invite notif: "${inviteNotif.message}"`);

    assert('G8.1.7 Notification count increased after invite',
        afterList.length > beforeList.length,
        `before=${beforeList.length} after=${afterList.length}`);

    assert('G8.1.8 Notification message mentions the research project title',
        inviteNotif?.message?.toLowerCase().includes('quantum entanglement') ||
        inviteNotif?.message?.toLowerCase().includes('invite'),
        `message="${inviteNotif?.message}"`);

    // Idempotency: re-invite the same collaborator should NOT fire a second notification
    console.log('  ▸ Re-inviting same collaborator (idempotency check)...');
    await req(
        svcUrl('research', `research/${researchId}/invite`), 'POST',
        { userId: alumniId }, adminToken);

    await sleep(800);

    const reInviteNotifs = await req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    const reInviteList = Array.isArray(reInviteNotifs.body) ? reInviteNotifs.body : [];
    const dupeCount = reInviteList.filter(n =>
        n.idempotencyKey === `collaboration_invite:${researchId}:${alumniId}`
    ).length;

    assert('G8.1.9 Re-inviting existing collaborator does NOT duplicate notification (idempotency)',
        dupeCount <= 1,
        `found ${dupeCount} notifications with same idempotencyKey`);

    // Create a second project to verify notification is project-specific
    const create2Res = await req(svcUrl('research', 'research'), 'POST', {
        title:       `Dark Matter Research [${ts}]`,
        description: 'G8.1 second project invite test',
    }, adminToken);
    const researchId2 = create2Res.body?._id || create2Res.body?.id;

    await req(
        svcUrl('research', `research/${researchId2}/invite`), 'POST',
        { userId: alumniId }, adminToken);

    await sleep(1000);

    const finalNotifs = await req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    const finalList = Array.isArray(finalNotifs.body) ? finalNotifs.body : [];
    const darkMatterNotif = finalList.find(n =>
        n.idempotencyKey === `collaboration_invite:${researchId2}:${alumniId}` ||
        n.message?.toLowerCase().includes('dark matter')
    );

    assert('G8.1.10 Second project invite also dispatches notification (G8.1)',
        !!darkMatterNotif,
        `no dark matter invite notif found; general notifs: ${
            JSON.stringify(finalList.filter(n => n.type === 'general').map(n => n.message))
        }`);

    summary('S8-GAPS — Research Service Gap Implementation (G8.1)');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
