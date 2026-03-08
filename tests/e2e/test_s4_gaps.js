/**
 * test_s4_gaps.js  —  Unit tests for S4 gap implementations
 *
 * Tests all 5 S4 gaps in isolation:
 *   G4.1: POST /events response includes rsvps[] array
 *   G4.2: Event creation dispatches GENERAL notification to creator
 *   G4.3: DELETE /events/:id/rsvp cancels an RSVP (removes user from rsvps)
 *   G4.4: EventStatus enum includes "cancelled" and transition works
 *   G4.5: Cancelling an event dispatches event_status_changed to all RSVP'd attendees
 *
 * This is a STANDALONE test — it does NOT modify test_s4.js.
 * Run individually:  node tests/e2e/test_s4_gaps.js
 *
 * Prerequisites: setup_personas.sh must have been run.
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, getUserId, svcUrl, sleep,
} = require('./shared');

async function main() {
    banner('S4-GAPS — Event Service: rsvps[], notifications, DELETE rsvp, cancelled status');

    // ──────────────────────────────────────────────────────────────────────────
    section('Setup — Load tokens');
    // ──────────────────────────────────────────────────────────────────────────
    const adminToken   = loadToken('.e2e_admin_token');
    const studentToken = loadToken('.e2e_student_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const studentId    = getUserId(studentToken);
    const alumniId     = getUserId(alumniToken);
    const adminId      = getUserId(adminToken);

    const ts = Date.now();
    const eventDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // ──────────────────────────────────────────────────────────────────────────
    section('G4.1 — POST /events response includes rsvps[] array');
    // ──────────────────────────────────────────────────────────────────────────

    const createRes = await req(svcUrl('event', 'events'), 'POST', {
        title:       `Gap Test Event [${ts}]`,
        description: 'Testing G4.1-G4.5 gap implementations',
        eventDate:   eventDate,
        location:    'Test Hall',
    }, adminToken);

    assert('G4.1.1 Admin: POST /events → 201',
        createRes.status === 201 || createRes.status === 200,
        `got HTTP ${createRes.status}: ${JSON.stringify(createRes.body)}`);

    const eventId = createRes.body?._id || createRes.body?.id;
    assert('G4.1.2 Created event has _id', !!eventId,
        `body: ${JSON.stringify(createRes.body)}`);

    assert('G4.1.3 POST /events response includes rsvps[] field (G4.1)',
        Array.isArray(createRes.body?.rsvps),
        `rsvps field: ${JSON.stringify(createRes.body?.rsvps)}, keys: ${JSON.stringify(Object.keys(createRes.body || {}))}`);

    assert('G4.1.4 rsvps[] is empty on creation',
        Array.isArray(createRes.body?.rsvps) && createRes.body.rsvps.length === 0,
        `rsvps: ${JSON.stringify(createRes.body?.rsvps)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('G4.2 — Event creation dispatches GENERAL notification to creator');
    // ──────────────────────────────────────────────────────────────────────────

    console.log('  ▸ Waiting 1.5s for async notification delivery...');
    await sleep(1500);

    const adminNotifs = await req(svcUrl('notification', 'notifications'), 'GET', null, adminToken);
    assert('G4.2.1 GET /notifications (admin/creator) → 200',
        adminNotifs.status === 200,
        `got HTTP ${adminNotifs.status}`);

    const allAdminNotifs = Array.isArray(adminNotifs.body) ? adminNotifs.body : [];
    const creationNotif = allAdminNotifs.find(
        n => n.type === 'general' &&
             (n.idempotencyKey === `event_created:${eventId}:${adminId}` ||
              n.message?.includes('Gap Test Event'))
    );

    assert('G4.2.2 GENERAL notification in creator inbox (G4.2)',
        !!creationNotif,
        `found ${allAdminNotifs.length} admin notifications, general types: ${
            JSON.stringify(allAdminNotifs.filter(n => n.type === 'general').map(n => n.message))
        }`);

    if (creationNotif) {
        console.log(`  ▸ Creator notification: "${creationNotif.message}"`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    section('G4.3 — DELETE /events/:id/rsvp cancels RSVP');
    // ──────────────────────────────────────────────────────────────────────────

    // Student RSVPs first
    const rsvpRes = await req(svcUrl('event', `events/${eventId}/rsvp`), 'POST', null, studentToken);
    assert('G4.3.1 Student: POST /events/:id/rsvp → 200/201',
        rsvpRes.status === 200 || rsvpRes.status === 201,
        `got HTTP ${rsvpRes.status}: ${JSON.stringify(rsvpRes.body)}`);

    const rsvpsAfterJoin = rsvpRes.body?.rsvps || [];
    assert('G4.3.2 Student appears in rsvps after RSVP',
        rsvpsAfterJoin.includes(studentId) || rsvpsAfterJoin.length >= 1,
        `rsvps: ${JSON.stringify(rsvpsAfterJoin)}`);

    // Cancel the RSVP
    const cancelRsvpRes = await req(svcUrl('event', `events/${eventId}/rsvp`), 'DELETE', null, studentToken);
    assert('G4.3.3 DELETE /events/:id/rsvp → 200 (G4.3)',
        cancelRsvpRes.status === 200,
        `got HTTP ${cancelRsvpRes.status}: ${JSON.stringify(cancelRsvpRes.body)}`);

    const rsvpsAfterCancel = cancelRsvpRes.body?.rsvps || [];
    assert('G4.3.4 Student removed from rsvps after DELETE /rsvp',
        !rsvpsAfterCancel.includes(studentId),
        `rsvps after cancel: ${JSON.stringify(rsvpsAfterCancel)}`);

    // Idempotent: cancelling again should still succeed (no error)
    const cancelAgainRes = await req(svcUrl('event', `events/${eventId}/rsvp`), 'DELETE', null, studentToken);
    assert('G4.3.5 DELETE /rsvp a second time is non-destructive (200)',
        cancelAgainRes.status === 200,
        `got HTTP ${cancelAgainRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('G4.4 — "cancelled" is a valid EventStatus transition');
    // ──────────────────────────────────────────────────────────────────────────

    // Create a dedicated cancellation-test event (upcoming → cancelled)
    const cancelEventRes = await req(svcUrl('event', 'events'), 'POST', {
        title:       `Cancellation Test Event [${ts}]`,
        description: 'This event will be cancelled immediately',
        eventDate:   eventDate,
    }, adminToken);

    assert('G4.4.1 Admin: POST /events → 201 (second event)',
        cancelEventRes.status === 201 || cancelEventRes.status === 200,
        `got HTTP ${cancelEventRes.status}`);

    const cancelEventId = cancelEventRes.body?._id || cancelEventRes.body?.id;
    assert('G4.4.2 Second event has _id', !!cancelEventId,
        `body: ${JSON.stringify(cancelEventRes.body)}`);

    // RSVP student + alumni so we can test notification dispatch (G4.5)
    const stu2 = await req(svcUrl('event', `events/${cancelEventId}/rsvp`), 'POST', null, studentToken);
    assert('G4.4.3 Student RSVPs to cancellation-test event',
        stu2.status === 200 || stu2.status === 201,
        `got HTTP ${stu2.status}`);

    const alu2 = await req(svcUrl('event', `events/${cancelEventId}/rsvp`), 'POST', null, alumniToken);
    assert('G4.4.4 Alumni RSVPs to cancellation-test event',
        alu2.status === 200 || alu2.status === 201,
        `got HTTP ${alu2.status}`);

    // Cancel the event
    const cancelStatusRes = await req(
        svcUrl('event', `events/${cancelEventId}/status`), 'PATCH',
        { status: 'cancelled' }, adminToken);

    assert('G4.4.5 PATCH /events/:id/status with "cancelled" → 200 (G4.4)',
        cancelStatusRes.status === 200,
        `got HTTP ${cancelStatusRes.status}: ${JSON.stringify(cancelStatusRes.body)}`);

    assert('G4.4.6 Event status updated to "cancelled"',
        cancelStatusRes.body?.status === 'cancelled',
        `status=${cancelStatusRes.body?.status}`);

    // Invalid: re-cancel or transition from cancelled → anything
    const reCancelRes = await req(
        svcUrl('event', `events/${cancelEventId}/status`), 'PATCH',
        { status: 'ended' }, adminToken);
    assert('G4.4.7 cancelled → ended → 400 (terminal state, no further transitions)',
        reCancelRes.status === 400,
        `got HTTP ${reCancelRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('G4.5 — Cancellation dispatches event_status_changed to all attendees');
    // ──────────────────────────────────────────────────────────────────────────

    console.log('  ▸ Waiting 1.5s for async notification delivery to attendees...');
    await sleep(1500);

    // Check student
    const stuNotifs = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    assert('G4.5.1 GET /notifications (student) → 200',
        stuNotifs.status === 200,
        `got HTTP ${stuNotifs.status}`);

    const stuNotifList = Array.isArray(stuNotifs.body) ? stuNotifs.body : [];
    const stuCancelNotif = stuNotifList.find(
        n => n.type === 'event_status_changed' &&
             (n.idempotencyKey === `event_cancelled:${cancelEventId}:${studentId}` ||
              n.message?.includes('cancelled'))
    );

    assert('G4.5.2 Student receives event_status_changed notification (G4.5)',
        !!stuCancelNotif,
        `found ${stuNotifList.length} notifications; event_status_changed: ${
            JSON.stringify(stuNotifList.filter(n => n.type === 'event_status_changed').map(n => n.message))
        }`);

    if (stuCancelNotif) console.log(`  ▸ Student cancel notification: "${stuCancelNotif.message}"`);

    // Check alumni
    const aluNotifs = await req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    assert('G4.5.3 GET /notifications (alumni) → 200',
        aluNotifs.status === 200,
        `got HTTP ${aluNotifs.status}`);

    const aluNotifList = Array.isArray(aluNotifs.body) ? aluNotifs.body : [];
    const aluCancelNotif = aluNotifList.find(
        n => n.type === 'event_status_changed' &&
             (n.idempotencyKey === `event_cancelled:${cancelEventId}:${alumniId}` ||
              n.message?.includes('cancelled'))
    );

    assert('G4.5.4 Alumni receives event_status_changed notification (G4.5)',
        !!aluCancelNotif,
        `found ${aluNotifList.length} notifications; event_status_changed: ${
            JSON.stringify(aluNotifList.filter(n => n.type === 'event_status_changed').map(n => n.message))
        }`);

    if (aluCancelNotif) console.log(`  ▸ Alumni cancel notification: "${aluCancelNotif.message}"`);

    // Bonus: RSVP to cancelled event should fail
    const rsvpCancelledRes = await req(svcUrl('event', `events/${cancelEventId}/rsvp`), 'POST', null, studentToken);
    assert('G4.5.5 POST /rsvp on cancelled event → 400 Bad Request',
        rsvpCancelledRes.status === 400,
        `got HTTP ${rsvpCancelledRes.status}: ${JSON.stringify(rsvpCancelledRes.body)}`);

    summary('S4-GAPS — Event Service Gap Implementations (G4.1–G4.5)');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
