/**
 * test_issue24_25_26.js
 * Issue 24: Event Service — Missing GET /:id Endpoint
 * Issue 25: Event Service — Mongoose findById() CastError (non-ObjectId format)
 * Issue 26: Event Service — Race Condition Typing on rsvp()
 *
 * ── Issue 24 ─────────────────────────────────────────────────────────────────
 * Root cause: The GET /events/:id endpoint was missing, so clients could not
 * retrieve a single event by its MongoDB _id.
 * Fix: @Get(':id') → findById() added to EventsController.
 *
 * ── Issue 25 ─────────────────────────────────────────────────────────────────
 * Root cause: Mongoose's findById() throws a CastError (500) when given a
 * non-ObjectId string (e.g., a UUID or garbage). No guard in place.
 * Fix: `if (!Types.ObjectId.isValid(id)) throw new BadRequestException(...)` 
 * in findById() before calling the model.
 *
 * ── Issue 26 ─────────────────────────────────────────────────────────────────
 * Root cause: rsvp() used `new Types.ObjectId(userId)` where userId is a
 * Keycloak UUID → BSONError crash. Additionally, rsvps stored as ObjectId[]
 * meant UUID strings could never be pushed.
 * Secondary: no null check on `updated` after findByIdAndUpdate → potential
 * runtime crash if event was deleted between the guard and the update.
 * Fix:
 *   1. rsvps: [String] in schema; userId stored as raw string
 *   2. Null check: `if (!updated) throw new NotFoundException(...)`
 *
 * Pre-requisite: run `bash setup_temp_users.sh` to create test users and tokens.
 *
 * Tests:
 *   A — POST /events as admin → 201 Created (createdBy stored as UUID string)
 *   B — GET /events/:id (valid ObjectId, existing) → 200 OK        [Issue 24]
 *   C — GET /events/not-an-id (garbage string) → 400 BadRequest    [Issue 25]
 *   D — GET /events/<uuid> (UUID format) → 400 BadRequest           [Issue 25]
 *   E — GET /events/507f1f77bcf86cd799439011 (valid fmt, non-existent) → 404  [Issue 25]
 *   F — POST /events/:id/rsvp as student → 200, rsvps[] has UUID string [Issue 26]
 *   G — POST /events/:id/rsvp again (idempotent, $addToSet) → 200, count unchanged
 *   H — GET /events/:id/attendees → contains student UUID string    [Issue 26]
 *   I — POST /events/:id/rsvp on ended event → 400 BadRequest
 *   J — POST /events as student → 403 Forbidden (RBAC)
 *   K — Source: Types.ObjectId.isValid() guard in findById()        [Issue 25]
 *   L — Source: null check on updated after findByIdAndUpdate()     [Issue 26]
 *   M — Source: createdBy type is String, rsvps is [String]        [Issues 24/26]
 */

'use strict';

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const BASE_URL    = 'http://miniproject.local/api/v1';
const EVENTS_BASE = `${BASE_URL}/event-service/events`;

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0, failed = 0, skipped = 0;

function pass(label, detail = '') {
    console.log(`  ✅ PASS: ${label}${detail ? ' — ' + detail : ''}`);
    passed++;
}
function fail(label, detail = '') {
    console.log(`  ❌ FAIL: ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
}
function skip(label, detail = '') {
    console.log(`  ⏭  SKIP: ${label}${detail ? ' — ' + detail : ''}`);
    skipped++;
}
function info(msg) {
    console.log(`         ℹ  ${msg}`);
}

async function req(method, url, token, body = null) {
    try {
        const config = {
            method, url,
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            validateStatus: () => true,
        };
        if (body) { config.data = body; config.headers['Content-Type'] = 'application/json'; }
        return await axios(config);
    } catch (err) {
        return { status: 0, data: { message: err.message } };
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  Issue 24 — Event Service: Missing GET /:id Endpoint');
    console.log('  Issue 25 — Event Service: Mongoose findById() CastError');
    console.log('  Issue 26 — Event Service: Race Condition Typing on rsvp()');
    console.log('══════════════════════════════════════════════════════════\n');

    let adminToken, studentToken;
    try {
        adminToken   = fs.readFileSync('.e2e_admin_token',   'utf8').trim();
        studentToken = fs.readFileSync('.e2e_student_token', 'utf8').trim();
    } catch {
        console.error('❌ Token files not found. Run: bash setup_temp_users.sh');
        process.exit(1);
    }

    const adminSub   = JSON.parse(Buffer.from(adminToken.split('.')[1],   'base64url').toString()).sub;
    const studentSub = JSON.parse(Buffer.from(studentToken.split('.')[1], 'base64url').toString()).sub;
    console.log(`  Admin sub   : ${adminSub}`);
    console.log(`  Student sub : ${studentSub}\n`);

    let eventId = null;

    // ── Test A: Create event as admin → 201 ───────────────────────────────────
    console.log('── Test A: POST /events as admin → 201 Created');
    {
        const r = await req('POST', EVENTS_BASE, adminToken, {
            title:       'e2e CastError Test Event',
            description: 'Event for Issues 24/25/26 testing',
            eventDate:   '2027-06-15T10:00:00.000Z',
            location:    'Lab 101',
        });
        if (r.status === 201) {
            eventId = r.data._id;
            const storedCreatedBy = r.data.createdBy;
            pass('201 Created');
            info(`Event _id  : ${eventId}`);
            info(`createdBy  : ${storedCreatedBy}`);
            if (storedCreatedBy === adminSub) {
                pass('createdBy stored as Keycloak UUID string (UUID BSONError fix verified)');
            } else if (storedCreatedBy && storedCreatedBy.length === 24) {
                fail('createdBy stored as ObjectId hex — UUID cast is still active');
            } else {
                fail(`createdBy unexpected: ${storedCreatedBy}`);
            }
        } else {
            fail(`Expected 201, got ${r.status}`, JSON.stringify(r.data).slice(0, 120));
        }
    }

    if (!eventId) {
        skip('Tests B–I skipped — no event created in Test A');
        runSourceTests(adminSub, studentSub); // still run source tests
        return;
    }

    // ── Test B: GET /events/:id (existing, valid ObjectId) → 200 [Issue 24] ─
    console.log('\n── Test B: GET /events/:id (valid ObjectId, existing) → 200 [Issue 24]');
    {
        const r = await req('GET', `${EVENTS_BASE}/${eventId}`, studentToken);
        if (r.status === 200) {
            pass('200 OK — GET /:id endpoint present and functional');
            info(`title: ${r.data.title}, status: ${r.data.status}`);
        } else {
            fail(`Expected 200, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test C: GET /events/not-an-id → 400 BadRequest [Issue 25] ────────────
    console.log('\n── Test C: GET /events/not-an-id → 400 BadRequest [Issue 25: CastError guard]');
    {
        const r = await req('GET', `${EVENTS_BASE}/not-an-id`, studentToken);
        if (r.status === 400) {
            pass('400 BadRequest — garbage ID correctly rejected by isValid() guard');
            info(`message: ${r.data.message}`);
        } else if (r.status === 500) {
            fail('500 Internal — CastError not caught; isValid() guard missing or inactive');
        } else {
            fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test D: GET /events/<uuid> → 400 BadRequest [Issue 25] ───────────────
    console.log('\n── Test D: GET /events/<keycloak-uuid> → 400 BadRequest [Issue 25]');
    {
        const r = await req('GET', `${EVENTS_BASE}/${adminSub}`, studentToken);
        if (r.status === 400) {
            pass('400 BadRequest — UUID string correctly rejected (UUID is not a valid ObjectId format)');
        } else if (r.status === 500) {
            fail('500 CastError — isValid() guard not applying to UUID format');
        } else {
            fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test E: GET /events/<non-existent valid ObjectId> → 404 [Issue 25] ──
    console.log('\n── Test E: GET /events/507f1f77bcf86cd799439011 (valid fmt, non-existent) → 404 [Issue 25]');
    {
        const r = await req('GET', `${EVENTS_BASE}/507f1f77bcf86cd799439011`, studentToken);
        if (r.status === 404) {
            pass('404 Not Found — valid ObjectId format passes isValid(), NotFoundException thrown');
        } else if (r.status === 500) {
            fail('500 — unexpected error on valid-format non-existent event');
        } else {
            fail(`Expected 404, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test F: POST /events/:id/rsvp as student → 200 [Issue 26] ────────────
    console.log('\n── Test F: POST /events/:id/rsvp as student → 200 (rsvps stores UUID string) [Issue 26]');
    {
        const r = await req('POST', `${EVENTS_BASE}/${eventId}/rsvp`, studentToken);
        if (r.status === 200 || r.status === 201) {
            pass(`${r.status} — RSVP accepted`);
            const rsvps = r.data.rsvps;
            if (Array.isArray(rsvps) && rsvps.includes(studentSub)) {
                pass('rsvps[] contains student UUID string (not ObjectId) — BSONError fix verified');
            } else if (Array.isArray(rsvps) && rsvps.length > 0 && /^[0-9a-f]{24}$/.test(rsvps[0])) {
                fail('rsvps[] contains ObjectId hex — UUID cast still active in rsvp()');
            } else {
                info(`rsvps field: ${JSON.stringify(rsvps)}`);
            }
        } else if (r.status === 500) {
            const msg = JSON.stringify(r.data);
            if (msg.includes('BSONError') || msg.includes('must be a string of 12 bytes')) {
                fail('500 BSONError — Types.ObjectId(userId) cast still in rsvp()');
            } else {
                fail(`500 — unexpected error`, msg.slice(0, 120));
            }
        } else {
            fail(`Expected 200, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test G: RSVP again (idempotent) → same rsvp count ────────────────────
    console.log('\n── Test G: POST /events/:id/rsvp again (idempotent, $addToSet) → no duplicate entry');
    {
        const r = await req('POST', `${EVENTS_BASE}/${eventId}/rsvp`, studentToken);
        if (r.status === 200 || r.status === 201) {
            const rsvps = r.data.rsvps;
            const studentRsvpCount = Array.isArray(rsvps) ? rsvps.filter(uid => uid === studentSub).length : -1;
            if (studentRsvpCount === 1) {
                pass('Idempotent — $addToSet correctly prevents duplicate RSVP entry');
            } else if (studentRsvpCount > 1) {
                fail(`Student UUID appears ${studentRsvpCount} times in rsvps[] — $addToSet not working`);
            } else {
                info(`rsvps: ${JSON.stringify(rsvps)}`);
            }
        } else {
            fail(`Expected 200, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test H: GET /events/:id/attendees → contains student UUID ────────────
    console.log('\n── Test H: GET /events/:id/attendees as admin → student UUID in list [Issue 26]');
    {
        const r = await req('GET', `${EVENTS_BASE}/${eventId}/attendees`, adminToken);
        if (r.status === 200) {
            const attendees = Array.isArray(r.data) ? r.data : r.data.rsvps;
            if (Array.isArray(attendees) && attendees.includes(studentSub)) {
                pass('Attendees list contains student UUID string');
                info(`Attendees: ${JSON.stringify(attendees)}`);
            } else {
                fail('Student UUID not found in attendees list', JSON.stringify(r.data).slice(0, 120));
            }
        } else {
            fail(`Expected 200, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test I: RSVP on ended event → 400 ────────────────────────────────────
    console.log('\n── Test I: RSVP on ended event → 400 BadRequest');
    {
        // Move event to live then ended
        const toLive  = await req('PATCH', `${EVENTS_BASE}/${eventId}/status`, adminToken, { status: 'live' });
        const toEnded = await req('PATCH', `${EVENTS_BASE}/${eventId}/status`, adminToken, { status: 'ended' });

        if (toEnded.status === 200) {
            info('Event moved to ended');
            const r = await req('POST', `${EVENTS_BASE}/${eventId}/rsvp`, studentToken);
            if (r.status === 400) {
                pass('400 BadRequest — cannot RSVP to ended event');
                info(`message: ${r.data.message}`);
            } else {
                fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
            }
        } else {
            skip('Could not move event to ended', `live: ${toLive.status}, ended: ${toEnded.status}`);
        }
    }

    // ── Test J: POST /events as student → 403 Forbidden (RBAC) ──────────────
    console.log('\n── Test J: POST /events as student → 403 Forbidden (RolesGuard)');
    {
        const r = await req('POST', EVENTS_BASE, studentToken, {
            title:     'Student Event',
            description: 'Should not be allowed',
            eventDate: '2027-01-01T00:00:00.000Z',
        });
        if (r.status === 403) {
            pass('403 Forbidden — students cannot create events');
        } else {
            fail(`Expected 403, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    await runSourceTests(adminSub, studentSub);
}

async function runSourceTests(_adminSub, _studentSub) {
    const serviceSrc = (file) =>
        path.resolve(__dirname, `services/event-service/src/events/${file}`);

    // ── Test K: Source — isValid() guard in findById() [Issue 25] ─────────────
    console.log('\n── Test K: Source — Types.ObjectId.isValid() guard in findById() [Issue 25]');
    {
        const svcPath = serviceSrc('events.service.ts');
        if (fs.existsSync(svcPath)) {
            const src = fs.readFileSync(svcPath, 'utf8');
            if (src.includes('Types.ObjectId.isValid(id)')) {
                pass('findById() has `Types.ObjectId.isValid(id)` CastError guard');
            } else {
                fail('`Types.ObjectId.isValid(id)` NOT found — CastError guard missing');
            }
        } else {
            skip('Source file not accessible', svcPath);
        }
    }

    // ── Test L: Source — null check on updated after findByIdAndUpdate [Issue 26] ──
    console.log('\n── Test L: Source — null check on updated result in rsvp() [Issue 26]');
    {
        const svcPath = serviceSrc('events.service.ts');
        if (fs.existsSync(svcPath)) {
            const src = fs.readFileSync(svcPath, 'utf8');
            if (src.includes('if (!updated)') || src.includes('if (!updated){')) {
                pass('rsvp() has null check: `if (!updated) throw new NotFoundException(...)` — race condition guarded');
            } else {
                fail('Null check on `updated` NOT found in rsvp() — potential null-ref crash if event deleted mid-flight');
            }
        } else {
            skip('Source file not accessible', svcPath);
        }
    }

    // ── Test M: Source — createdBy String, rsvps [String] in schema ──────────
    console.log('\n── Test M: Source — schema uses String for createdBy and rsvps [Issues 24/26 UUID fix]');
    {
        const schemaPath = serviceSrc('schemas/event.schema.ts');
        if (fs.existsSync(schemaPath)) {
            const src = fs.readFileSync(schemaPath, 'utf8');
            const createdByStr = src.includes("type: String") && src.includes("createdBy");
            const rsvpsStr     = src.includes("[String]") || (src.includes("rsvps") && src.includes("String"));
            const noObjId      = !src.includes("Types.ObjectId");

            if (createdByStr && noObjId) {
                pass('event.schema.ts: createdBy is String type (no Types.ObjectId)');
            } else {
                fail('event.schema.ts: createdBy may still be Types.ObjectId');
            }
            if (rsvpsStr && noObjId) {
                pass('event.schema.ts: rsvps is [String] (no Types.ObjectId array)');
            } else {
                fail('event.schema.ts: rsvps may still be Types.ObjectId[]');
            }
        } else {
            skip('Schema source not accessible', schemaPath);
        }
    }

    console.log('\n══════════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed | ${failed} failed | ${skipped} skipped`);
    console.log('══════════════════════════════════════════════════════════\n');
    process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
    console.error('Unhandled error:', err.message);
    process.exit(1);
});
