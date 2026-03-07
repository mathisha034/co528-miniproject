const http = require('http');
const crypto = require('crypto');

const AUTHOR_ID = crypto.randomBytes(12).toString('hex');
const LIKER_ID = crypto.randomBytes(12).toString('hex');

function createJWT(payload, secret) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(encodedHeader + '.' + encodedPayload).digest('base64url');
    return encodedHeader + '.' + encodedPayload + '.' + signature;
}

const AUTHOR_TOKEN = createJWT({
    sub: AUTHOR_ID,
    email: `author-${AUTHOR_ID}@test.com`,
    name: 'Author User',
    realm_access: { roles: ['student'] }
}, 'dev-secret-change-in-production');

const LIKER_TOKEN = createJWT({
    sub: LIKER_ID,
    email: `liker-${LIKER_ID}@test.com`,
    name: 'Liker User',
    realm_access: { roles: ['student'] }
}, 'dev-secret-change-in-production');

async function request(host, port, path, method, body, token) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: host,
            port: port,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runJourney() {
    try {
        console.log("=== 1. Simulating User Sync ===");
        console.log(`Author Identity: ${AUTHOR_ID}`);
        console.log(`Liker Identity: ${LIKER_ID}`);

        console.log("\n=== 2. Creating Post (Feed Service) ===");
        const postRes = await request('feed-service', 3002, '/api/v1/feed', 'POST', {
            content: "This is my first integration post",
            authorId: AUTHOR_ID
        }, AUTHOR_TOKEN);
        console.log(`Status: ${postRes.status}, Body: ${postRes.data}`);

        let postId = 'dummy-post-id';
        if (postRes.data) {
            try { const parsed = JSON.parse(postRes.data); if (parsed.id || parsed._id) postId = parsed.id || parsed._id; } catch (e) { }
        }

        console.log(`\n=== 3. Liking Post ${postId} (Feed Service) by Liker ===`);
        const likeRes = await request('feed-service', 3002, `/api/v1/feed/${postId}/like`, 'POST', null, LIKER_TOKEN);
        console.log(`Status: ${likeRes.status}, Body: ${likeRes.data}`);

        console.log("\nWaiting 3 seconds for async Kafka/RabbitMQ events to propagate...");
        await new Promise(r => setTimeout(r, 3000));

        // Get notifications for author
        console.log("\n=== 4. Getting Notifications for Author (Notification Service) ===");
        const notifRes = await request('notification-service', 3006, `/api/v1/notifications?userId=${AUTHOR_ID}`, 'GET', null, AUTHOR_TOKEN);
        console.log(`Status: ${notifRes.status}, Body: ${notifRes.data}`);

        console.log("\n=== End of Journey ===");
    } catch (e) { console.error("Error during journey:", e); }
}

runJourney();
