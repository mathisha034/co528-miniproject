const http = require('http');
const crypto = require('crypto');

const AUTHOR_ID = crypto.randomBytes(12).toString('hex');
const LIKER_ID = crypto.randomBytes(12).toString('hex');

function createJWT(payload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', 'dev-secret-change-in-production').update(encodedHeader + '.' + encodedPayload).digest('base64url');
    return encodedHeader + '.' + encodedPayload + '.' + signature;
}

const AUTHOR_TOKEN = createJWT({
    sub: AUTHOR_ID, email: `author@test.com`, name: 'Author', realm_access: { roles: ['student', 'admin'] }
});

const LIKER_TOKEN = createJWT({
    sub: LIKER_ID, email: `liker@test.com`, name: 'Liker', realm_access: { roles: ['student', 'admin'] }
});

async function request(host, port, path, method, body, token) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: host, port, path, method, headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        }, (res) => {
            let data = ''; res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runTest() {
    console.log("=== Staged Integration Test ===");
    try {
        const postRes = await request('feed-service', 3002, '/api/v1/feed', 'POST', { content: "Test Post", authorId: AUTHOR_ID }, AUTHOR_TOKEN);
        console.log(`[Feed] Post Create: ${postRes.status}`);
        const postId = JSON.parse(postRes.data)._id || JSON.parse(postRes.data).id;

        const likeRes = await request('feed-service', 3002, `/api/v1/feed/${postId}/like`, 'POST', null, LIKER_TOKEN);
        console.log(`[Feed/Event] Post Like by ${LIKER_ID}: ${likeRes.status}`);

        console.log("[System] Waiting 3 seconds for async propagation...");
        await new Promise(r => setTimeout(r, 3000));

        const notifRes = await request('notification-service', 3006, `/api/v1/notifications?userId=${AUTHOR_ID}`, 'GET', null, AUTHOR_TOKEN);
        console.log(`[Notification] Fetch for Author: ${notifRes.status}`);
        console.log(`[Notification] Body: ${notifRes.data}`);
    } catch (e) { console.error(e); }
}
runTest();
