#!/usr/bin/env node
/**
 * S8 — Full Platform Journey (18-Step Cross-Service Integration)
 * ===============================================================
 * Actors : Ashan (student), Nimali (alumni), Dr. Rajapaksha (admin)
 *
 * This scenario runs through every service in one ordered flow to verify
 * that the complete user journey works end-to-end.
 *
 * Services exercised (in order):
 *  user × feed × job × event × research × notification × analytics
 *
 * Run: node tests/e2e/test_s8.js
 */

'use strict';

const {
    req, reqMultipart, assert, section, banner, summary,
    loadToken, getUserId, decodeClaims, svcUrl, sleep, TINY_JPEG,
} = require('./shared');

async function main() {
    banner('S8 — Full Platform Journey (18-Step Cross-Service Integration)');

    const studentToken = loadToken('.e2e_student_token');
    const alumniToken  = loadToken('.e2e_alumni_token');
    const adminToken   = loadToken('.e2e_admin_token');
    const studentId    = getUserId(studentToken);
    const alumniId     = getUserId(alumniToken);

    const ts = Date.now();

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 1 — JWT Claims Validated for All Three Personas');
    // ──────────────────────────────────────────────────────────────────────────

    const studentClaims = decodeClaims(studentToken);
    const alumniClaims  = decodeClaims(alumniToken);
    const adminClaims   = decodeClaims(adminToken);

    assert('S8.01 Student JWT has realm_access.roles containing "student"',
        (studentClaims?.realm_access?.roles || []).includes('student'),
        `roles=${JSON.stringify(studentClaims?.realm_access?.roles)}`);

    assert('S8.02 Alumni JWT has realm_access.roles containing "alumni"',
        (alumniClaims?.realm_access?.roles || []).includes('alumni'),
        `roles=${JSON.stringify(alumniClaims?.realm_access?.roles)}`);

    assert('S8.03 Admin JWT has realm_access.roles containing "admin"',
        (adminClaims?.realm_access?.roles || []).includes('admin'),
        `roles=${JSON.stringify(adminClaims?.realm_access?.roles)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 2 — user-service: GET /users/me for each persona');
    // ──────────────────────────────────────────────────────────────────────────

    const studentMeRes = await req(svcUrl('user', 'users/me'), 'GET', null, studentToken);
    assert('S8.04 Student: GET /users/me → 200',
        studentMeRes.status === 200,
        `got HTTP ${studentMeRes.status}: ${JSON.stringify(studentMeRes.body)?.substring(0,100)}`);

    assert('S8.05 Student profile keycloakId matches JWT sub',
        studentMeRes.body?.keycloakId === studentId,
        `keycloakId=${studentMeRes.body?.keycloakId} sub=${studentId.slice(0,8)}...`);

    const alumniMeRes = await req(svcUrl('user', 'users/me'), 'GET', null, alumniToken);
    assert('S8.06 Alumni: GET /users/me → 200',
        alumniMeRes.status === 200, `got HTTP ${alumniMeRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 3 — user-service: PATCH /users/me (profile update)');
    // ──────────────────────────────────────────────────────────────────────────

    const patchMeRes = await req(svcUrl('user', 'users/me'), 'PATCH', {
        bio: `S8 Full Journey test — ${ts}`,
    }, studentToken);
    assert('S8.07 Student: PATCH /users/me bio → 200',
        patchMeRes.status === 200,
        `got HTTP ${patchMeRes.status}: ${JSON.stringify(patchMeRes.body)?.substring(0,100)}`);

    assert('S8.08 Updated bio reflected in response',
        patchMeRes.body?.bio?.includes(`${ts}`) || patchMeRes.body?.bio?.includes('S8'),
        `bio=${patchMeRes.body?.bio}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 4 — feed-service: Text Post by Alumni');
    // ──────────────────────────────────────────────────────────────────────────

    const textPostRes = await req(svcUrl('feed', 'feed'), 'POST', {
        content: `S8 Journey — Alumni text post [${ts}]`,
    }, alumniToken);
    assert('S8.09 Alumni: POST /feed (text) → 201 or 200',
        textPostRes.status === 201 || textPostRes.status === 200,
        `got HTTP ${textPostRes.status}: ${JSON.stringify(textPostRes.body)?.substring(0,100)}`);

    const textPostId = textPostRes.body?._id || textPostRes.body?.id;
    assert('S8.10 Text post has _id',
        !!textPostId, `body: ${JSON.stringify(textPostRes.body)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 5 — feed-service: Image Upload + Image Post');
    // ──────────────────────────────────────────────────────────────────────────

    const uploadRes = await reqMultipart(
        svcUrl('feed', 'feed/upload'),
        alumniToken, TINY_JPEG, 'image/jpeg', 'file', 'test_image.jpg');
    console.log(`  ▸ POST /feed/upload → HTTP ${uploadRes.status}: ${JSON.stringify(uploadRes.body)}`);
    assert('S8.11 POST /feed/upload → 201 or 200',
        uploadRes.status === 201 || uploadRes.status === 200,
        `got HTTP ${uploadRes.status}: ${JSON.stringify(uploadRes.body)}`);

    const imageUrl = uploadRes.body?.imageUrl || uploadRes.body?.url;
    assert('S8.12 Upload response contains imageUrl',
        typeof imageUrl === 'string' && imageUrl.length > 0,
        `imageUrl=${imageUrl}`);

    const imagePostRes = await req(svcUrl('feed', 'feed'), 'POST', {
        content: `S8 Journey — Alumni image post [${ts}]`,
        imageUrl,
    }, alumniToken);
    assert('S8.13 POST /feed with imageUrl → 201 or 200',
        imagePostRes.status === 201 || imagePostRes.status === 200,
        `got HTTP ${imagePostRes.status}: ${JSON.stringify(imagePostRes.body)?.substring(0,80)}`);

    const imagePostId = imagePostRes.body?._id || imagePostRes.body?.id;

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 6 — feed-service: Student Reads Feed, Likes a Post');
    // ──────────────────────────────────────────────────────────────────────────

    const feedRes = await req(svcUrl('feed', 'feed'), 'GET', null, studentToken);
    assert('S8.14 Student: GET /feed → 200',
        feedRes.status === 200, `got HTTP ${feedRes.status}`);

    const posts = Array.isArray(feedRes.body) ? feedRes.body : feedRes.body?.items || feedRes.body?.posts || [];
    const foundTextPost = posts.some(p => (p._id || p.id) === textPostId);
    assert('S8.15 Text post appears in student feed',
        foundTextPost, `postId=${textPostId} not in ${posts.length} posts`);

    // Cache warmed — second GET should also be 200
    const feedRes2 = await req(svcUrl('feed', 'feed'), 'GET', null, studentToken);
    assert('S8.16 Repeated GET /feed (Redis cache hit) → 200',
        feedRes2.status === 200, `got HTTP ${feedRes2.status}`);

    // Like a post → triggers notification
    const likeRes = await req(
        svcUrl('feed', `feed/${textPostId}/like`), 'POST', null, studentToken);
    assert('S8.17 Student: POST /feed/:id/like → 200 or 201',
        likeRes.status === 200 || likeRes.status === 201,
        `got HTTP ${likeRes.status}: ${JSON.stringify(likeRes.body)?.substring(0,80)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 7 — notification-service: Alumni notified of like');
    // ──────────────────────────────────────────────────────────────────────────

    await sleep(1200);
    const notifRes = await req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    assert('S8.18 Alumni: GET /notifications → 200',
        notifRes.status === 200, `got HTTP ${notifRes.status}`);

    const notifs = Array.isArray(notifRes.body) ? notifRes.body : notifRes.body?.notifications || [];
    const likeNotif = notifs.find(n =>
        (n.type === 'like' || n.type === 'LIKE') ||
        JSON.stringify(n).toLowerCase().includes('like'));
    assert('S8.19 Like notification delivered to alumni',
        !!likeNotif,
        `${notifs.length} notifs, none with type=like. First: ${JSON.stringify(notifs[0])?.substring(0,80)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 8 — job-service: Admin Creates Job, Student Applies');
    // ──────────────────────────────────────────────────────────────────────────

    const jobRes = await req(svcUrl('job', 'jobs'), 'POST', {
        title: `S8 Journey Software Engineer [${ts}]`,
        company: 'MegaCorp',
        description: 'Full journey test role. Requires Go and Kubernetes.',
        deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
    }, adminToken);
    assert('S8.20 Admin: POST /jobs → 201',
        jobRes.status === 201 || jobRes.status === 200,
        `got HTTP ${jobRes.status}: ${JSON.stringify(jobRes.body)?.substring(0,80)}`);

    const jobId = jobRes.body?._id || jobRes.body?.id;

    const applyRes = await req(
        svcUrl('job', `jobs/${jobId}/apply`), 'POST',
        { coverLetter: 'S8 full journey test application.' }, studentToken);
    assert('S8.21 Student: POST /jobs/:id/apply → 200 or 201',
        applyRes.status === 200 || applyRes.status === 201,
        `got HTTP ${applyRes.status}: ${JSON.stringify(applyRes.body)?.substring(0,80)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 9 — event-service: Admin Creates Event, Student RSVPs');
    // ──────────────────────────────────────────────────────────────────────────

    const eventRes = await req(svcUrl('event', 'events'), 'POST', {
        title: `S8 Journey Developer Conference [${ts}]`,
        description: 'Annual developer meetup for S8 journey test.',
        eventDate: new Date(Date.now() + 14 * 86400000).toISOString(),
        location: 'Colombo, Sri Lanka',
    }, adminToken);
    assert('S8.22 Admin: POST /events → 201',
        eventRes.status === 201 || eventRes.status === 200,
        `got HTTP ${eventRes.status}: ${JSON.stringify(eventRes.body)?.substring(0,80)}`);

    const eventId = eventRes.body?._id || eventRes.body?.id;

    const rsvpRes = await req(
        svcUrl('event', `events/${eventId}/rsvp`), 'POST', null, studentToken);
    assert('S8.23 Student: POST /events/:id/rsvp → 200 or 201',
        rsvpRes.status === 200 || rsvpRes.status === 201,
        `got HTTP ${rsvpRes.status}: ${JSON.stringify(rsvpRes.body)?.substring(0,80)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 10 — research-service: Admin Creates Research Project');
    // ──────────────────────────────────────────────────────────────────────────

    const researchRes = await req(svcUrl('research', 'research'), 'POST', {
        title: `S8 Journey AI Research Project [${ts}]`,
        description: 'Cross-service integration journey research project.',
        tags: ['ai', 'integration', 'e2e'],
    }, adminToken);
    assert('S8.24 Admin: POST /research → 201',
        researchRes.status === 201 || researchRes.status === 200,
        `got HTTP ${researchRes.status}: ${JSON.stringify(researchRes.body)?.substring(0,80)}`);

    const researchId = researchRes.body?._id || researchRes.body?.id;

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 11 — research-service: Upload Document, Invite Collaborator');
    // ──────────────────────────────────────────────────────────────────────────

    const docUploadRes = await reqMultipart(
        svcUrl('research', `research/${researchId}/documents`),
        adminToken, TINY_JPEG, 'application/pdf', 'file', 'research_doc.pdf');
    assert('S8.25 Admin: POST /research/:id/documents → 200 or 201',
        docUploadRes.status === 200 || docUploadRes.status === 201,
        `got HTTP ${docUploadRes.status}: ${JSON.stringify(docUploadRes.body)?.substring(0,80)}`);

    const inviteRes = await req(
        svcUrl('research', `research/${researchId}/invite`), 'POST',
        { userId: alumniId }, adminToken);
    assert('S8.26 Admin: POST /research/:id/invite alumniId → 200',
        inviteRes.status === 200 || inviteRes.status === 201,
        `got HTTP ${inviteRes.status}: ${JSON.stringify(inviteRes.body)?.substring(0,80)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 12 — notification-service: Alumni notified of invite');
    // ──────────────────────────────────────────────────────────────────────────

    await sleep(1200);
    const inviteNotifRes = await req(svcUrl('notification', 'notifications'), 'GET', null, alumniToken);
    assert('S8.27 Alumni: GET /notifications (after research invite) → 200',
        inviteNotifRes.status === 200, `got HTTP ${inviteNotifRes.status}`);

    const inviteNotifs = Array.isArray(inviteNotifRes.body) ? inviteNotifRes.body
        : (inviteNotifRes.body?.notifications || []);
    const hasInviteNotif = inviteNotifs.some(n =>
        n.type === 'COLLABORATION_INVITE' || n.type === 'collaboration_invite' ||
        JSON.stringify(n).toLowerCase().includes('invite') ||
        JSON.stringify(n).toLowerCase().includes('research'));
    assert('S8.28 Research collaboration invite notification delivered to alumni (G8.1)',
        hasInviteNotif,
        `${inviteNotifs.length} notifications present, none of type invite/research. ` +
        `general notifs: ${JSON.stringify(inviteNotifs.filter(n => n.type === 'general').map(n => n.message))}`);
    if (hasInviteNotif) console.log(`  \u25b8 invite notif: "${inviteNotifs.find(n => JSON.stringify(n).toLowerCase().includes('invite') || JSON.stringify(n).toLowerCase().includes('research'))?.message}"`);

    // Unread count should be ≥ 1
    const countRes = await req(svcUrl('notification', 'notifications/count'), 'GET', null, alumniToken);
    assert('S8.29 GET /notifications/count → 200',
        countRes.status === 200, `got HTTP ${countRes.status}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 13 — notification-service: Mark all as read');
    // ──────────────────────────────────────────────────────────────────────────

    const readAllRes = await req(
        svcUrl('notification', 'notifications/read-all'), 'PATCH', null, alumniToken);
    assert('S8.30 Alumni: PATCH /notifications/read-all → 200',
        readAllRes.status === 200, `got HTTP ${readAllRes.status}`);

    const countAfterReadAll = await req(svcUrl('notification', 'notifications/count'), 'GET', null, alumniToken);
    assert('S8.31 Unread count = 0 after read-all',
        countAfterReadAll.body?.count === 0 || countAfterReadAll.body?.unread === 0,
        `count=${JSON.stringify(countAfterReadAll.body)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 14 — analytics-service: Overview Reflects All Activity');
    // ──────────────────────────────────────────────────────────────────────────

    const overviewRes = await req(svcUrl('analytics', 'analytics/overview'), 'GET', null, adminToken);
    assert('S8.32 GET /analytics/overview → 200',
        overviewRes.status === 200, `got HTTP ${overviewRes.status}`);

    assert('S8.33 overview.posts ≥ 2 (text + image post created above)',
        (overviewRes.body?.posts ?? 0) >= 2,
        `posts=${overviewRes.body?.posts}`);

    assert('S8.34 overview.jobs ≥ 1',
        (overviewRes.body?.jobs ?? 0) >= 1, `jobs=${overviewRes.body?.jobs}`);

    assert('S8.35 overview.events ≥ 1',
        (overviewRes.body?.events ?? 0) >= 1, `events=${overviewRes.body?.events}`);

    assert('S8.36 overview.users ≥ 3',
        (overviewRes.body?.users ?? 0) >= 3, `users=${overviewRes.body?.users}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 15 — Cross-Service State Consistency Checks');
    // ──────────────────────────────────────────────────────────────────────────

    // Verify feed post is still visible
    const feedVerifyRes = await req(svcUrl('feed', 'feed'), 'GET', null, studentToken);
    const feedPosts = Array.isArray(feedVerifyRes.body) ? feedVerifyRes.body
        : feedVerifyRes.body?.items || feedVerifyRes.body?.posts || [];
    const textPostStillThere = feedPosts.some(p => (p._id || p.id) === textPostId);
    assert('S8.37 Text post (from Step 4) still in feed',
        textPostStillThere, `postId=${textPostId} not found`);

    // Verify job still retrievable
    const jobVerifyRes = await req(svcUrl('job', `jobs/${jobId}`), 'GET', null, studentToken);
    assert('S8.38 Job (from Step 8) still retrievable via GET /jobs/:id',
        jobVerifyRes.status === 200 && (jobVerifyRes.body?._id || jobVerifyRes.body?.id) === jobId,
        `got HTTP ${jobVerifyRes.status}`);

    // Verify research project still retrievable with collaborator
    const researchVerifyRes = await req(svcUrl('research', `research/${researchId}`), 'GET', null, adminToken);
    assert('S8.39 Research project (from Step 10) still retrievable',
        researchVerifyRes.status === 200,
        `got HTTP ${researchVerifyRes.status}`);

    const collabs = researchVerifyRes.body?.collaborators || [];
    assert('S8.40 Alumni appears in research project collaborators',
        collabs.some(c => (typeof c === 'string' ? c === alumniId : c.userId === alumniId || c._id === alumniId)),
        `collaborators=${JSON.stringify(collabs)?.substring(0,100)}`);

    // Verify event RSVP registered
    const attendeesRes = await req(
        svcUrl('event', `events/${eventId}/attendees`), 'GET', null, adminToken);
    assert('S8.41 Admin: GET /events/:id/attendees → 200',
        attendeesRes.status === 200, `got HTTP ${attendeesRes.status}`);

    const attendees = Array.isArray(attendeesRes.body) ? attendeesRes.body
        : attendeesRes.body?.attendees || [];
    assert('S8.42 Student appears in event attendees',
        attendees.some(a => a === studentId || a.userId === studentId || a.keycloakId === studentId),
        `studentId ${studentId.slice(0,8)}... not in ${JSON.stringify(attendees)?.substring(0,100)}`);

    // ──────────────────────────────────────────────────────────────────────────
    section('Step 16 — Admin admin-only routes validated');
    // ──────────────────────────────────────────────────────────────────────────

    // GET /users (admin-only)
    const allUsersRes = await req(svcUrl('user', 'users'), 'GET', null, adminToken);
    assert('S8.43 Admin: GET /users → 200',
        allUsersRes.status === 200, `got HTTP ${allUsersRes.status}`);

    const studentGetAllUsers = await req(svcUrl('user', 'users'), 'GET', null, studentToken);
    assert('S8.44 Student: GET /users → 403',
        studentGetAllUsers.status === 403,
        `got HTTP ${studentGetAllUsers.status}`);

    // GET /analytics/latencies (admin-only)
    const latencyRes = await req(svcUrl('analytics', 'analytics/latencies'), 'GET', null, adminToken);
    assert('S8.45 Admin: GET /analytics/latencies → 200',
        latencyRes.status === 200, `got HTTP ${latencyRes.status}`);

    summary('S8 — Full Platform Journey (18-Step Cross-Service Integration)');
}

main().catch(e => { console.error('[FATAL]', e); process.exit(1); });
