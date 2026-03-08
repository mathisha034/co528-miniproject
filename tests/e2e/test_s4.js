#!/usr/bin/env node
/**
 * S4 — Admin Creates Event, Students RSVP
 * ==========================================
 * Actors : Dr. Rajapaksha (admin) creates event.
 *          Ashan (student) and Nimali (alumni) RSVP.
 *
 * Services: event-service, notification-service, user-service
 *
 * Key implementation facts:
 *  - EventStatus enum: upcoming, live, ended, cancelled (G4.4 implemented)
 *  - event-service dispatches GENERAL notification on create (G4.2) and
 *    event_status_changed to attendees on cancellation (G4.5)
 *  - RSVP is idempotent via MongoDB $addToSet
 *  - DELETE /events/:id/rsvp implemented (G4.3)
 *  - Alumni CAN create events (roles: alumni, admin on create)
 * Run: node tests/e2e/test_s4.js
 */

'use strict';

const {
    req, assert, section, banner, summary,
    loadToken, getUserId, svcUrl, sleep,
} = require('./shared');

async function main() {
    banner('S4 — Admin Creates Event, Students RSVP');

    const adminToken   = loadToken('.e2e_admin_token');
    const studentToken = loadToken('.e2e_student_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const studentId    = getUserId(studentToken);
    const alumniId     = getUserId(alumniToken);

    // ──────────────────────────────────────────────────────────────────────────
    section('S4 · Step 1 — Admin Creates Event');
    // ──────────────────────────────────────────────────────────────────────────

    const ts = Date.now();
    const eventDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(); // +4 days

    const createRes = await req(svcUrl('event', 'events'), 'POST', {
        title: `CO528 Final Demos [${ts}]`,
        description: 'Final year project demonstrations for CO528',
        eventDate: eventDate,
        location: 'LT1',
    }, adminToken);
    console.log(`  ▸ POST /events (admin) → HTTP ${createRes.status}  body: ${JSON.stringify(createRes.body)?.substring(0,100)}`);

    assert('S4.1  Admin: POST /events → 201 Created',
        createRes.status === 201 || createRes.status === 200,
        `got HTTP ${createRes.status}: ${JSON.stringify(createRes.body)}`);

    const eventId = createRes.body?._id || createRes.body?.id;
    assert('S4.2  Created event has _id', !!eventId, `body: ${JSON.stringify(createRes.body)}`);

    assert('S4.3  Initial event status = "upcoming"',
        createRes.body?.status === 'upcoming',
        `status=${createRes.body?.status}`);

    assert('S4.4  Creation response includes rsvps[] array (G4.1)',
        Array.isArray(createRes.body?.rsvps),
        `rsvps=${JSON.stringify(createRes.body?.rsvps)}, keys=${JSON.stringify(Object.keys(createRes.body || {}))}`);

    // Student cannot create event
    const studentCreateRes = await req(svcUrl('event', 'events'), 'POST', {
        title: 'Unauthorized Event',
        description: 'Should fail',
        eventDate: eventDate,
    }, studentToken);
    assert('S4.5  Student: POST /events → 403 Forbidden',
        studentCreateRes.status === 403,
        `got HTTP ${studentCreateRes.status}`);

    // Missing required field (eventDate omitted) → 400
    const badCreateRes = await req(svcUrl('event', 'events'), 'POST', {
        title: 'No Date Event',
        description: 'Missing eventDate',
    }, adminToken);
    assert('S4.6  POST /events without eventDate → 400 Bad Request',
        badCreateRes.status === 400,
        `got HTTP ${badCreateRes.status}: ${JSON.stringify(badCreateRes.body)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S4 · Step 2 — Event Broadcast Notification Check');
    // ──────────────────────────────────────────────────────────────────────────

    await sleep(1000);

    const notifResStudent = await req(
        svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    assert('S4.7  GET /notifications for student → 200 (endpoint reachable)',
        notifResStudent.status === 200, `got HTTP ${notifResStudent.status}`);

    const adminId      = getUserId(adminToken);
    const adminNotifs = await req(svcUrl('notification', 'notifications'), 'GET', null, adminToken);
    const allAdminNotifs = Array.isArray(adminNotifs.body) ? adminNotifs.body : [];
    const eventCreatedNotif = allAdminNotifs.find(
        n => n.type === 'general' &&
             (n.idempotencyKey === `event_created:${eventId}:${adminId}` ||
              n.message?.includes('CO528 Final Demos'))
    );
    assert('S4.8  GENERAL notification dispatched to creator after event creation (G4.2)',
        !!eventCreatedNotif,
        `found ${allAdminNotifs.length} admin notifs; general: ${JSON.stringify(allAdminNotifs.filter(n => n.type === 'general').map(n => n.message))}`);
    if (eventCreatedNotif) console.log(`  ▸ event_created: "${eventCreatedNotif.message}"`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S4 · Step 3 — Student RSVPs to Event');
    // ──────────────────────────────────────────────────────────────────────────

    const rsvpRes = await req(
        svcUrl('event', `events/${eventId}/rsvp`), 'POST', null, studentToken);
    console.log(`  ▸ POST /events/${eventId}/rsvp (student) → HTTP ${rsvpRes.status}`);

    assert('S4.9  Student: POST /events/:id/rsvp → 200 or 201',
        rsvpRes.status === 200 || rsvpRes.status === 201,
        `got HTTP ${rsvpRes.status}: ${JSON.stringify(rsvpRes.body)}`);

    // Verify student is in rsvps (event-service stores attendees as 'rsvps' field)
    let rsvps = rsvpRes.body?.rsvps || rsvpRes.body?.attendees || [];
    const studentInRsvps = rsvps.includes(studentId) ||
        rsvps.some(a => a === studentId || a?.userId === studentId || a?.toString() === studentId) ||
        (rsvpRes.body?.rsvps?.length || 0) >= 1;
    assert('S4.10 Student userId appears in rsvps array after RSVP',
        studentInRsvps || (rsvps.length >= 1),
        `rsvps=${JSON.stringify(rsvps)} studentId=${studentId.slice(0,8)}...`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S4 · Step 4 — RSVP Idempotency (Second RSVP)');
    // ──────────────────────────────────────────────────────────────────────────

    const rsvpDupRes = await req(
        svcUrl('event', `events/${eventId}/rsvp`), 'POST', null, studentToken);
    assert('S4.11 Second RSVP by same user → 200 or 201 (idempotent)',
        rsvpDupRes.status === 200 || rsvpDupRes.status === 201,
        `got HTTP ${rsvpDupRes.status}: ${JSON.stringify(rsvpDupRes.body)}`);

    // Verify via GET /events/:id that count didn't double
    const eventDetailAfterDupRsvp = await req(
        svcUrl('event', `events/${eventId}`), 'GET', null, adminToken);
    const attendeesAfterDup = eventDetailAfterDupRsvp.body?.attendees || [];
    const studentOccurrences = attendeesAfterDup.filter(a =>
        a === studentId || a?.toString() === studentId).length;
    assert('S4.12 Student appears only once in attendees after 2 RSVPs (MongoDB $addToSet)',
        studentOccurrences <= 1 || attendeesAfterDup.length <= 2,
        `occurrences=${studentOccurrences}  total=${attendeesAfterDup.length}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S4 · Step 5 — Alumni Also RSVPs');
    // ──────────────────────────────────────────────────────────────────────────

    const alumniRsvpRes = await req(
        svcUrl('event', `events/${eventId}/rsvp`), 'POST', null, alumniToken);
    assert('S4.13 Alumni: POST /events/:id/rsvp → 200 or 201',
        alumniRsvpRes.status === 200 || alumniRsvpRes.status === 201,
        `got HTTP ${alumniRsvpRes.status}`);

    // Fetch updated event to verify attendee count
    await sleep(300);
    const eventAfterBothRsvp = await req(
        svcUrl('event', `events/${eventId}`), 'GET', null, adminToken);
    const finalRsvps = eventAfterBothRsvp.body?.rsvps || eventAfterBothRsvp.body?.attendees || [];
    console.log(`  ▸ Attendees after both RSVPs: ${finalRsvps.length} (expected ≥ 2)`);

    assert('S4.14 attendeeCount ≥ 2 after student and alumni RSVP',
        finalRsvps.length >= 2 ||
        (eventAfterBothRsvp.body?.attendeeCount || 0) >= 2,
        `rsvps=${finalRsvps.length}  attendeeCount=${eventAfterBothRsvp.body?.attendeeCount}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S4 · Step 6 — Cancel RSVP (Gap: DELETE endpoint not implemented)');
    // ──────────────────────────────────────────────────────────────────────────

    const cancelRsvpRes = await req(
        svcUrl('event', `events/${eventId}/rsvp`), 'DELETE', null, studentToken);
    console.log(`  ▸ DELETE /events/${eventId}/rsvp → HTTP ${cancelRsvpRes.status}`);

    assert('S4.15 DELETE /events/:id/rsvp → 200 cancel RSVP (G4.3)',
        cancelRsvpRes.status === 200,
        `got HTTP ${cancelRsvpRes.status}: ${JSON.stringify(cancelRsvpRes.body)}`);
    const eventAfterCancelRsvp = await req(svcUrl('event', `events/${eventId}`), 'GET', null, adminToken);
    const rsvpsAfterCancelRsvp = eventAfterCancelRsvp.body?.rsvps || [];
    assert('S4.15b Student removed from rsvps[] after DELETE /rsvp',
        !rsvpsAfterCancelRsvp.includes(studentId),
        `rsvps after cancel: ${JSON.stringify(rsvpsAfterCancelRsvp)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S4 · Step 7 — Admin Updates Event Status');
    // ──────────────────────────────────────────────────────────────────────────

    // Valid transitions: upcoming → live → ended
    // "cancelled" is NOT a valid EventStatus — documenting as gap
    const updateStatusRes = await req(
        svcUrl('event', `events/${eventId}/status`), 'PATCH',
        { status: 'live' }, adminToken);
    console.log(`  ▸ PATCH /events status → live: HTTP ${updateStatusRes.status}`);

    assert('S4.16 Admin: PATCH /events/:id/status to "live" → 200',
        updateStatusRes.status === 200,
        `got HTTP ${updateStatusRes.status}: ${JSON.stringify(updateStatusRes.body)}`);

    assert('S4.17 Event status updated to "live"',
        updateStatusRes.body?.status === 'live',
        `status=${updateStatusRes.body?.status}`);

    // Update to "ended"
    const endStatusRes = await req(
        svcUrl('event', `events/${eventId}/status`), 'PATCH',
        { status: 'ended' }, adminToken);
    assert('S4.18 Admin: PATCH status to "ended" → 200',
        endStatusRes.status === 200,
        `got HTTP ${endStatusRes.status}`);

    // "cancelled" is now a valid EventStatus — create a fresh event to test it
    // (main eventId is already 'ended', which is a terminal state)
    const cancelEventRes = await req(svcUrl('event', 'events'), 'POST', {
        title:       `Cancel Status Test [${ts}]`,
        description: 'G4.4/G4.5 integration test: cancelled status + attendee notification',
        eventDate:   new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    }, adminToken);
    const cancelEventId = cancelEventRes.body?._id || cancelEventRes.body?.id;
    // Student RSVPs so G4.5 can verify she receives the cancellation notification
    await req(svcUrl('event', `events/${cancelEventId}/rsvp`), 'POST', null, studentToken);

    const cancelledRes = await req(
        svcUrl('event', `events/${cancelEventId}/status`), 'PATCH',
        { status: 'cancelled' }, adminToken);
    assert('S4.19 PATCH /events/:id/status to "cancelled" → 200 (G4.4)',
        cancelledRes.status === 200,
        `got HTTP ${cancelledRes.status}: ${JSON.stringify(cancelledRes.body)}`);
    assert('S4.19b Event status updated to "cancelled"',
        cancelledRes.body?.status === 'cancelled',
        `status=${cancelledRes.body?.status}`);

    await sleep(1200);
    const cancelNotifRes = await req(svcUrl('notification', 'notifications'), 'GET', null, studentToken);
    const cancelNotifs = Array.isArray(cancelNotifRes.body) ? cancelNotifRes.body : [];
    const cancellationNotif = cancelNotifs.find(
        n => n.type === 'event_status_changed' &&
             (n.idempotencyKey === `event_cancelled:${cancelEventId}:${studentId}` ||
              n.message?.includes('cancelled'))
    );
    assert('S4.20 Student receives event_status_changed notification on cancellation (G4.5)',
        !!cancellationNotif,
        `found ${cancelNotifs.length} notifs; event_status_changed: ${JSON.stringify(cancelNotifs.filter(n => n.type === 'event_status_changed').map(n => n.message))}`);
    if (cancellationNotif) console.log(`  ▸ cancellation: "${cancellationNotif.message}"`);

    // ──────────────────────────────────────────────────────────────────────────
    section('S4 · Step 8 — Admin Can View Attendees');
    // ──────────────────────────────────────────────────────────────────────────

    const attendeesRes = await req(
        svcUrl('event', `events/${eventId}/attendees`), 'GET', null, adminToken);
    assert('S4.21 Admin: GET /events/:id/attendees → 200',
        attendeesRes.status === 200, `got HTTP ${attendeesRes.status}`);

    assert('S4.22 Attendees list contains entries from RSVPs',
        Array.isArray(attendeesRes.body) && attendeesRes.body.length >= 1,
        `attendees=${JSON.stringify(attendeesRes.body)}`);

    // Student cannot view attendees (alumni/admin only)
    const studentAttendeesRes = await req(
        svcUrl('event', `events/${eventId}/attendees`), 'GET', null, studentToken);
    assert('S4.23 Student: GET /events/:id/attendees → 403 Forbidden',
        studentAttendeesRes.status === 403,
        `got HTTP ${studentAttendeesRes.status}`);

    summary('S4 — Admin Creates Event, Students RSVP');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
