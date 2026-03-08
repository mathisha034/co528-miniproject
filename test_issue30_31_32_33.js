/**
 * test_issue30_31_32_33.js
 * Issue 30: Research Service — Missing Validation Constraints
 * Issue 31: Research Service — uploadDocument() Undefined Attachment
 * Issue 32: Research Service — Upload Operation Atomicity (MinIO compensation)
 * Issue 33: Research Service — Blind Collaborator Appendings (UUID validation)
 *
 * ── Issue 30 ─────────────────────────────────────────────────────────────────
 * Root cause: Without `ValidationPipe` and class-validator annotations, the
 * research endpoints accepted any payload (missing required fields, wrong types,
 * etc.) and let the schema enforce constraints — often resulting in misleading
 * 500 errors rather than meaningful 400 responses.
 * Fix: `ValidationPipe({ whitelist: true, transform: true })` in main.ts +
 * `@IsString()`, `@MinLength(3)`, `@IsEnum(ResearchStatus)`, `@IsUUID()` decorators on DTOs.
 *
 * ── Issue 31 ─────────────────────────────────────────────────────────────────
 * Root cause: `uploadDocument()` accessed `file.buffer` without checking if
 * `file` was defined — a missing file attachment would crash with TypeError.
 * Fix: `if (!file) throw new BadRequestException('A file attachment is required')`
 * at the top of the controller method.
 *
 * ── Issue 32 ─────────────────────────────────────────────────────────────────
 * Root cause: MinIO upload succeeded but subsequent MongoDB save() could fail,
 * leaving the MinIO object orphaned (no DB record pointing to it — data inconsistency).
 * Fix: Wrap the save() in a try/catch. If it throws, call `minioClient.removeObject()`
 * to roll back the MinIO upload.
 *
 * ── Issue 33 ─────────────────────────────────────────────────────────────────
 * Root cause: `inviteCollaborator()` accepted any `userId` string without format
 * validation, allowing non-UUID strings (empty, garbage) to be appended to
 * the collaborators array.
 * Fix: `@IsUUID()` on `InviteCollaboratorDto.userId` + ValidationPipe enforcement.
 *
 * Pre-requisite: run `bash setup_temp_users.sh` to create test users and tokens.
 *
 * Tests (Issue 30 — validation constraints):
 *   A — POST /research with missing title → 400 BadRequest
 *   B — POST /research with title shorter than 3 chars → 400 BadRequest
 *   C — PATCH /research/:id with invalid status enum → 400 BadRequest
 *   D — POST /research with extra unknown fields → rejected/stripped (whitelist)
 *   E — POST /research with valid payload → 201 Created
 *
 * Tests (Issue 31 — file upload null guard):
 *   F — POST /research/:id/documents without any file → 400 BadRequest
 *
 * Tests (Issue 32 — MinIO compensation / atomicity):
 *   G — Source: uploadDocument() has try/catch wrapping project.save()
 *   H — Source: catch block calls minioClient.removeObject() for compensation
 *
 * Tests (Issue 33 — collaborator UUID validation):
 *   I — POST /research/:id/invite with non-UUID userId → 400 BadRequest
 *   J — POST /research/:id/invite with empty userId → 400 BadRequest
 *   K — POST /research/:id/invite with valid UUID → 200 OK
 *   L — POST /research/:id/invite by non-owner → 403 Forbidden
 *   M — Source: InviteCollaboratorDto has @IsUUID() on userId
 */

'use strict';

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const FormData = require('form-data');

const BASE_URL     = 'http://miniproject.local/api/v1';
const RESEARCH_BASE = `${BASE_URL}/research-service/research`;

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

async function uploadReq(url, token, fd) {
    try {
        const headers = { ...fd.getHeaders() };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return await axios.post(url, fd, { headers, validateStatus: () => true });
    } catch (err) {
        return { status: 0, data: { message: err.message } };
    }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('  Issue 30 — Research Service: Missing Validation Constraints');
    console.log('  Issue 31 — Research Service: uploadDocument() Undefined Attachment');
    console.log('  Issue 32 — Research Service: Upload Operation Atomicity');
    console.log('  Issue 33 — Research Service: Blind Collaborator Appendings');
    console.log('══════════════════════════════════════════════════════════\n');

    let adminToken, studentToken;
    try {
        adminToken   = fs.readFileSync('.e2e_admin_token',   'utf8').trim();
        studentToken = fs.readFileSync('.e2e_student_token', 'utf8').trim();
    } catch {
        console.error('❌ Token files not found. Run: bash setup_temp_users.sh');
        process.exit(1);
    }

    const studentSub = JSON.parse(Buffer.from(studentToken.split('.')[1], 'base64url').toString()).sub;
    const adminSub   = JSON.parse(Buffer.from(adminToken.split('.')[1],   'base64url').toString()).sub;
    console.log(`  Student sub : ${studentSub}`);
    console.log(`  Admin sub   : ${adminSub}\n`);

    let projectId = null;

    // ── Test A: POST /research with missing title → 400 [Issue 30] ───────────
    console.log('── Test A: POST /research with missing required `title` → 400 [Issue 30]');
    {
        const r = await req('POST', RESEARCH_BASE, studentToken, {
            description: 'No title provided',
        });
        if (r.status === 400) {
            pass('400 BadRequest — ValidationPipe rejects missing title');
            info(`errors: ${JSON.stringify(r.data?.message).slice(0, 100)}`);
        } else {
            fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test B: POST /research with title < 3 chars → 400 [Issue 30] ─────────
    console.log('\n── Test B: POST /research with title shorter than 3 chars → 400 [Issue 30]');
    {
        const r = await req('POST', RESEARCH_BASE, studentToken, {
            title: 'AB',
            description: 'Too short title',
        });
        if (r.status === 400) {
            pass('400 BadRequest — @MinLength(3) enforced by ValidationPipe');
            info(`errors: ${JSON.stringify(r.data?.message).slice(0, 100)}`);
        } else {
            fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    // ── Test E: POST /research with valid payload → 201 (baseline) ────────────
    console.log('\n── Test E: POST /research with valid payload → 201 (baseline project for further tests)');
    {
        const r = await req('POST', RESEARCH_BASE, studentToken, {
            title:       'Issue 30-33 Test Project',
            description: 'Created for validation and collaborator tests',
            tags:        ['e2e', 'test'],
        });
        if (r.status === 201) {
            projectId = r.data._id;
            pass('201 Created — valid payload accepted');
            info(`Project _id: ${projectId}`);
        } else {
            fail(`Expected 201, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    }

    if (projectId) {
        // ── Test C: PATCH /research/:id with invalid status enum → 400 [Issue 30] ──
        console.log('\n── Test C: PATCH /research/:id with invalid status enum → 400 [Issue 30]');
        {
            const r = await req('PATCH', `${RESEARCH_BASE}/${projectId}`, studentToken, {
                status: 'invalid_status',
            });
            if (r.status === 400) {
                pass('400 BadRequest — @IsEnum(ResearchStatus) rejects invalid status');
            } else {
                fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
            }
        }

        // ── Test D: POST /research with extra unknown fields → stripped (whitelist) ──
        console.log('\n── Test D: POST /research with extra unknown fields → 400 or stripped [Issue 30 whitelist]');
        {
            const r = await req('POST', RESEARCH_BASE, studentToken, {
                title:     'Whitelist Test Project',
                malicious: 'should be stripped',
                __proto__: { isAdmin: true },
            });
            // whitelist:true either strips or 400s unknown fields
            if (r.status === 201) {
                const hasExtra = r.data.malicious !== undefined;
                if (!hasExtra) {
                    pass('Unknown fields stripped by ValidationPipe whitelist (201 returned, extra fields removed)');
                } else {
                    fail('Extra field `malicious` was stored — whitelist not working');
                }
            } else if (r.status === 400) {
                pass('400 — unknown fields rejected by whitelist (strict mode)');
            } else {
                fail(`Unexpected ${r.status}`, JSON.stringify(r.data).slice(0, 80));
            }
        }
    }

    // ── Test F: POST /research/:id/documents without file → 400 [Issue 31] ───
    console.log('\n── Test F: POST /research/:id/documents without file attachment → 400 [Issue 31]');
    if (projectId) {
        // Send a multipart form with no file field
        const fd = new FormData();
        fd.append('dummy', 'notafile');
        const r = await uploadReq(`${RESEARCH_BASE}/${projectId}/documents`, studentToken, fd);
        if (r.status === 400) {
            pass('400 BadRequest — controller null-guard prevents crash on missing file');
            info(`message: ${r.data.message}`);
        } else if (r.status === 500) {
            const msg = JSON.stringify(r.data);
            if (msg.includes('Cannot read') || msg.includes('TypeError')) {
                fail('500 TypeError — missing file causes crash; BadRequestException not thrown (Issue 31 not fixed)');
            } else {
                fail(`500 — unexpected error`, msg.slice(0, 80));
            }
        } else {
            fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    } else {
        skip('Test F skipped — no project created in Test E');
    }

    // ── Test G/H: Source — MinIO compensation in uploadDocument [Issue 32] ────
    console.log('\n══ Issue 32 — Upload Atomicity ══\n');

    console.log('── Test G: Source — uploadDocument() has try/catch wrapping project.save() [Issue 32]');
    {
        const svcPath = path.resolve(
            __dirname,
            'services/research-service/src/research/research.service.ts'
        );
        if (fs.existsSync(svcPath)) {
            const src = fs.readFileSync(svcPath, 'utf8');
            if (src.includes('project.save()') && src.includes('try {') && src.includes('} catch (dbError)')) {
                pass('project.save() is wrapped in try/catch — DB failure is caught');
            } else {
                fail('try/catch around project.save() NOT found — atomicity fix missing');
            }
        } else {
            skip('Source file not accessible', svcPath);
        }
    }

    console.log('\n── Test H: Source — catch block calls minioClient.removeObject() [Issue 32]');
    {
        const svcPath = path.resolve(
            __dirname,
            'services/research-service/src/research/research.service.ts'
        );
        if (fs.existsSync(svcPath)) {
            const src = fs.readFileSync(svcPath, 'utf8');
            if (src.includes('removeObject') && src.includes('dbError')) {
                pass('catch block calls minioClient.removeObject() — MinIO rollback compensation implemented');
            } else {
                fail('minioClient.removeObject() call NOT found in catch block — orphaned MinIO objects possible');
            }
        } else {
            skip('Source file not accessible', svcPath);
        }
    }

    // ── Issue 33 Tests ────────────────────────────────────────────────────────
    console.log('\n══ Issue 33 — Collaborator UUID Validation ══\n');

    // ── Test I: Invite with non-UUID string → 400 [Issue 33] ─────────────────
    console.log('── Test I: POST /research/:id/invite with non-UUID userId → 400 [Issue 33]');
    if (projectId) {
        const r = await req('POST', `${RESEARCH_BASE}/${projectId}/invite`, studentToken, {
            userId: 'not-a-uuid-at-all',
        });
        if (r.status === 400) {
            pass('400 BadRequest — @IsUUID() rejects non-UUID string');
            info(`errors: ${JSON.stringify(r.data?.message).slice(0, 100)}`);
        } else {
            fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    } else {
        skip('Test I skipped — no project');
    }

    // ── Test J: Invite with empty userId → 400 [Issue 33] ────────────────────
    console.log('\n── Test J: POST /research/:id/invite with empty userId → 400 [Issue 33]');
    if (projectId) {
        const r = await req('POST', `${RESEARCH_BASE}/${projectId}/invite`, studentToken, {
            userId: '',
        });
        if (r.status === 400) {
            pass('400 BadRequest — @IsUUID() rejects empty string');
        } else {
            fail(`Expected 400, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    } else {
        skip('Test J skipped — no project');
    }

    // ── Test K: Invite with valid UUID → 200 [happy path] ────────────────────
    console.log('\n── Test K: POST /research/:id/invite with valid UUID (admin sub) → 200 [Issue 33]');
    if (projectId) {
        const r = await req('POST', `${RESEARCH_BASE}/${projectId}/invite`, studentToken, {
            userId: adminSub,
        });
        if (r.status === 200 || r.status === 201) {
            pass(`${r.status} — valid UUID accepted; collaborator added`);
            info(`collaborators: ${JSON.stringify(r.data?.collaborators)}`);
        } else {
            fail(`Expected 200/201, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    } else {
        skip('Test K skipped — no project');
    }

    // ── Test L: Invite by non-owner → 403 [RBAC/ownership] ───────────────────
    console.log('\n── Test L: POST /research/:id/invite by non-owner → 403 Forbidden');
    if (projectId) {
        // Admin tries to invite someone to student's project
        const r = await req('POST', `${RESEARCH_BASE}/${projectId}/invite`, adminToken, {
            userId: adminSub,
        });
        if (r.status === 403) {
            pass('403 Forbidden — non-owner cannot invite collaborators');
        } else if (r.status === 200 || r.status === 201) {
            fail('200/201 — non-owner was allowed to invite collaborators (ownership not enforced)');
        } else {
            fail(`Expected 403, got ${r.status}`, JSON.stringify(r.data).slice(0, 80));
        }
    } else {
        skip('Test L skipped — no project');
    }

    // ── Test M: Source — @IsUUID() on InviteCollaboratorDto.userId [Issue 33] ─
    console.log('\n── Test M: Source — @IsUUID() on InviteCollaboratorDto.userId [Issue 33]');
    {
        const dtoPath = path.resolve(
            __dirname,
            'services/research-service/src/research/dto/research.dto.ts'
        );
        if (fs.existsSync(dtoPath)) {
            const src = fs.readFileSync(dtoPath, 'utf8');
            if (src.includes('@IsUUID()') && src.includes('userId')) {
                pass('InviteCollaboratorDto has @IsUUID() on userId field');
            } else {
                fail('@IsUUID() annotation NOT found on userId in InviteCollaboratorDto');
            }
            if (src.includes('@MinLength(3)') && src.includes('title')) {
                pass('CreateResearchDto has @MinLength(3) on title field');
            } else {
                fail('@MinLength(3) NOT found on title — Issue 30 constraint missing');
            }
        } else {
            skip('DTO source not accessible', dtoPath);
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
