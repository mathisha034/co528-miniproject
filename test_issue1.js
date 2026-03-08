const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://miniproject.local/api/v1';

async function runTests() {
    console.log('--- Starting Issue 1 & 6 E2E Verification Workflow ---');

    const studentToken = fs.readFileSync('.e2e_student_token', 'utf8').trim();
    const adminToken = fs.readFileSync('.e2e_admin_token', 'utf8').trim();

    const studentObj = JSON.parse(Buffer.from(studentToken.split('.')[1], 'base64').toString());
    const adminObj = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64').toString());

    console.log(`\nVerified Temp Student ID: ${studentObj.sub}`);
    console.log(`Verified Temp Admin ID: ${adminObj.sub}`);

    try {
        console.log('\n--- 1. Testing Feed Service (Student) ---');
        console.log(`REQ: GET ${BASE_URL}/feed-service/feed`);
        const feedRes = await axios.get(`${BASE_URL}/feed-service/feed`, {
            headers: { Authorization: `Bearer ${studentToken}` }
        });
        console.log(`[PASS] Feed Response OK. Items contained:`, feedRes.data.items ? feedRes.data.items.length : 0);

        console.log('\n--- 2. Testing Job Service (Student) ---');
        console.log(`REQ: GET ${BASE_URL}/job-service/jobs`);
        const jobsRes = await axios.get(`${BASE_URL}/job-service/jobs`, {
            headers: { Authorization: `Bearer ${studentToken}` }
        });
        console.log(`[PASS] Jobs Response OK. Total Jobs:`, jobsRes.data.length);

        console.log('\n--- 3. Testing Event Service (Admin) ---');
        console.log(`REQ: GET ${BASE_URL}/event-service/events`);
        const eventsRes = await axios.get(`${BASE_URL}/event-service/events`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log(`[PASS] Events Response OK. Total Events:`, eventsRes.data.length);

        console.log('\n--- 4. Testing Analytics Service (Admin) ---');
        console.log(`REQ: GET ${BASE_URL}/analytics-service/analytics/overview`);
        const analyticsRes = await axios.get(`${BASE_URL}/analytics-service/analytics/overview`, {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        console.log(`[PASS] Analytics Response OK. Users Count:`, analyticsRes.data.users);

        console.log('\n✅ All targeted frontend -> backend mapped API paths responded 200 OK.');
        console.log('The Ingress rewrite rules and NestJS controller mappings are perfectly synchronized.');

    } catch (err) {
        console.error(`\n❌ [FAIL] Test encountered an error:`);
        console.error(`URL that failed:`, err.config?.url);
        console.error(`Status code:`, err.response?.status);
        console.error(`Response data:`, JSON.stringify(err.response?.data, null, 2));
        process.exit(1);
    }
}

runTests();
