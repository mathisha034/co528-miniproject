/**
 * DECP E2E Test Suite — Shared Helpers
 * =====================================
 * Used by all S1–S10 test scripts.
 *
 * Provides:
 *   req()          – JSON HTTP request
 *   reqMultipart() – multipart/form-data POST (file upload)
 *   assert()       – pass/fail tracker
 *   section()      – console section header
 *   summary()      – print final pass/fail totals and exit
 *   loadToken()    – read token from a file in the project root
 *   getUserId()    – decode Keycloak sub from a JWT
 *   svcUrl()       – build http://miniproject.local/api/v1/<svc>-service/<path>
 *   sleep()        – promise-based delay
 *   kube()         – kubectl wrapper (for resilience tests)
 */

'use strict';

const http   = require('http');
const https  = require('https');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE       = 'http://miniproject.local';
const NS         = 'miniproject';
const TIMEOUT_MS = 12_000;
/** Project root (two levels above tests/e2e/) */
const ROOT = path.join(__dirname, '..', '..');

// Minimal valid 1×1 JPEG for upload tests
const TINY_JPEG = Buffer.from([
    0xff,0xd8,0xff,0xe0,0x00,0x10,0x4a,0x46,0x49,0x46,0x00,0x01,0x01,0x00,
    0x00,0x01,0x00,0x01,0x00,0x00,0xff,0xdb,0x00,0x43,0x00,0x08,0x06,0x06,
    0x07,0x06,0x05,0x08,0x07,0x07,0x07,0x09,0x09,0x08,0x0a,0x0c,0x14,0x0d,
    0x0c,0x0b,0x0b,0x0c,0x19,0x12,0x13,0x0f,0x14,0x1d,0x1a,0x1f,0x1e,0x1d,
    0x1a,0x1c,0x1c,0x20,0x24,0x2e,0x27,0x20,0x22,0x2c,0x23,0x1c,0x1c,0x28,
    0x37,0x29,0x2c,0x30,0x31,0x34,0x34,0x34,0x1f,0x27,0x39,0x3d,0x38,0x32,
    0x3c,0x2e,0x33,0x34,0x32,0xff,0xc0,0x00,0x0b,0x08,0x00,0x01,0x00,0x01,
    0x01,0x01,0x11,0x00,0xff,0xc4,0x00,0x1f,0x00,0x00,0x01,0x05,0x01,0x01,
    0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,
    0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0a,0x0b,0xff,0xc4,0x00,0xb5,0x10,
    0x00,0x02,0x01,0x03,0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,
    0x01,0x7d,0x01,0x02,0x03,0x00,0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,
    0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,0x81,0x91,0xa1,0x08,0x23,0x42,
    0xb1,0xc1,0x15,0x52,0xd1,0xf0,0x24,0x33,0x62,0x72,0x82,0x09,0x0a,0x16,
    0x17,0x18,0x19,0x1a,0x25,0x26,0x27,0x28,0x29,0x2a,0x34,0x35,0x36,0x37,
    0x38,0x39,0x3a,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4a,0x53,0x54,0x55,
    0x56,0x57,0x58,0x59,0x5a,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6a,0x73,
    0x74,0x75,0x76,0x77,0x78,0x79,0x7a,0x83,0x84,0x85,0x86,0x87,0x88,0x89,
    0x8a,0x93,0x94,0x95,0x96,0x97,0x98,0x99,0x9a,0xa2,0xa3,0xa4,0xa5,0xa6,
    0xa7,0xa8,0xa9,0xaa,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb8,0xb9,0xba,0xc2,
    0xc3,0xc4,0xc5,0xc6,0xc7,0xc8,0xc9,0xca,0xd2,0xd3,0xd4,0xd5,0xd6,0xd7,
    0xd8,0xd9,0xda,0xe1,0xe2,0xe3,0xe4,0xe5,0xe6,0xe7,0xe8,0xe9,0xea,0xf1,
    0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf8,0xf9,0xfa,0xff,0xda,0x00,0x08,0x01,
    0x01,0x00,0x00,0x3f,0x00,0xfb,0xd2,0x8a,0x28,0x03,0xff,0xd9
]);

// ── HTTP request helpers ──────────────────────────────────────────────────────
/**
 * Make a JSON HTTP request.
 * @param {string} url
 * @param {string} method
 * @param {object|null} body
 * @param {string|null} token  Bearer token
 * @returns {Promise<{status:number, body:any, raw:string, ms:number}>}
 */
function req(url, method = 'GET', body = null, token = null) {
    return new Promise((resolve) => {
        const parsed = new URL(url);
        const lib    = parsed.protocol === 'https:' ? https : http;
        const hdrs   = { 'Content-Type': 'application/json' };
        if (token) hdrs['Authorization'] = `Bearer ${token}`;
        const bodyStr = body ? JSON.stringify(body) : null;
        if (bodyStr) hdrs['Content-Length'] = Buffer.byteLength(bodyStr);

        const startMs = Date.now();
        const request = lib.request({
            hostname : parsed.hostname,
            port     : parsed.port || 80,
            path     : parsed.pathname + (parsed.search || ''),
            method,
            headers  : hdrs,
            timeout  : TIMEOUT_MS,
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch (_) {}
                resolve({ status: res.statusCode, body: json, raw: data, ms: Date.now() - startMs });
            });
        });
        request.on('error', (e) =>
            resolve({ status: 0, body: null, raw: e.message, ms: Date.now() - startMs }));
        request.on('timeout', () => {
            request.destroy();
            resolve({ status: 0, body: null, raw: 'TIMEOUT', ms: TIMEOUT_MS });
        });
        if (bodyStr) request.write(bodyStr);
        request.end();
    });
}

/**
 * POST a multipart/form-data request.
 * @param {string}  url
 * @param {string|null} token
 * @param {Buffer}  [fileBuffer]  defaults to TINY_JPEG
 * @param {string}  [mimeType]
 * @param {string}  [fieldName]   form field name (default: 'file')
 * @param {string}  [filename]    file name in the part header
 */
function reqMultipart(url, token = null, fileBuffer = TINY_JPEG,
                      mimeType = 'image/jpeg', fieldName = 'file',
                      filename = 'test.jpg') {
    return new Promise((resolve) => {
        const parsed   = new URL(url);
        const lib      = parsed.protocol === 'https:' ? https : http;
        const boundary = 'e2eboundary' + Date.now();
        const CRLF     = '\r\n';
        const partHeader = Buffer.from(
            `--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${CRLF}` +
            `Content-Type: ${mimeType}${CRLF}${CRLF}`
        );
        const partFooter = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
        const bodyBuf    = Buffer.concat([partHeader, fileBuffer, partFooter]);
        const hdrs = {
            'Content-Type'   : `multipart/form-data; boundary=${boundary}`,
            'Content-Length' : bodyBuf.length,
        };
        if (token) hdrs['Authorization'] = `Bearer ${token}`;
        const startMs = Date.now();
        const request = lib.request({
            hostname : parsed.hostname,
            port     : parsed.port || 80,
            path     : parsed.pathname + (parsed.search || ''),
            method   : 'POST',
            headers  : hdrs,
            timeout  : TIMEOUT_MS,
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let json = null;
                try { json = JSON.parse(data); } catch (_) {}
                resolve({ status: res.statusCode, body: json, raw: data, ms: Date.now() - startMs });
            });
        });
        request.on('error', (e) =>
            resolve({ status: 0, body: null, raw: e.message, ms: Date.now() - startMs }));
        request.on('timeout', () => {
            request.destroy();
            resolve({ status: 0, body: null, raw: 'TIMEOUT', ms: TIMEOUT_MS });
        });
        request.write(bodyBuf);
        request.end();
    });
}

// ── Test runner ───────────────────────────────────────────────────────────────
const ALL_RESULTS = [];
let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) {
        console.log(`  ✅  PASS  ${name}`);
        ALL_RESULTS.push({ name, ok: true });
        passed++;
    } else {
        console.log(`  ❌  FAIL  ${name}${detail ? '  —  ' + detail : ''}`);
        ALL_RESULTS.push({ name, ok: false, detail });
        failed++;
    }
}

function assertGap(name, detail = '') {
    console.log(`  ⚠️   GAP   ${name}${detail ? '  —  ' + detail : ''}`);
    ALL_RESULTS.push({ name, ok: 'gap', detail });
}

function section(title) {
    console.log(`\n${'─'.repeat(65)}`);
    console.log(`▶  ${title}`);
    console.log('─'.repeat(65));
}

function banner(title) {
    console.log(`\n${'═'.repeat(65)}`);
    console.log(`   ${title}`);
    console.log('═'.repeat(65));
}

function summary(suiteName) {
    const gaps = ALL_RESULTS.filter(r => r.ok === 'gap').length;
    console.log(`\n${'═'.repeat(65)}`);
    console.log(` ${suiteName}:`);
    console.log(`   PASSED : ${passed}`);
    console.log(`   FAILED : ${failed}`);
    if (gaps > 0) console.log(`   GAPS   : ${gaps}  (implementation gaps documented)`);
    console.log('═'.repeat(65));
    if (failed > 0) {
        console.log('\nFailed assertions:');
        ALL_RESULTS.filter(r => r.ok === false).forEach(r =>
            console.log(`  ❌  ${r.name}${r.detail ? '\n        ' + r.detail : ''}`)
        );
    }
    if (gaps > 0) {
        console.log('\nKnown implementation gaps:');
        ALL_RESULTS.filter(r => r.ok === 'gap').forEach(r =>
            console.log(`  ⚠️   ${r.name}${r.detail ? '\n        ' + r.detail : ''}`)
        );
    }
    process.exit(failed > 0 ? 1 : 0);
}

// ── Token helpers ─────────────────────────────────────────────────────────────
function loadToken(filename) {
    const fp = path.join(ROOT, filename);
    if (!fs.existsSync(fp)) throw new Error(`Token file not found: ${fp} — run setup_personas.sh`);
    return fs.readFileSync(fp, 'utf8').trim();
}

function loadId(filename) {
    const fp = path.join(ROOT, filename);
    if (!fs.existsSync(fp)) return null;
    return fs.readFileSync(fp, 'utf8').trim();
}

function getUserId(token) {
    const payload = token.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).sub;
}

/** Decode the full JWT payload (claims). */
function decodeClaims(token) {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
}

// ── URL helper ────────────────────────────────────────────────────────────────
function svcUrl(svc, endpoint) {
    return `${BASE}/api/v1/${svc}-service/${endpoint}`;
}

// ── Misc helpers ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function kube(args) {
    try {
        return execSync(`kubectl ${args} -n ${NS} 2>&1`, { encoding: 'utf8' }).trim();
    } catch (e) {
        return e.stdout ? e.stdout.trim() : e.message;
    }
}

function waitForPodReady(labelSelector, timeoutMs = 60_000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const out = kube(`get pods -l ${labelSelector} --no-headers`);
        if (out.includes('Running') && !out.includes('0/')) return Date.now() - start;
        execSync('sleep 2');
    }
    return -1;
}

module.exports = {
    req, reqMultipart, assert, assertGap, section, banner, summary,
    loadToken, loadId, getUserId, decodeClaims, svcUrl, sleep,
    kube, waitForPodReady,
    ALL_RESULTS, TINY_JPEG, ROOT, NS, BASE,
};
