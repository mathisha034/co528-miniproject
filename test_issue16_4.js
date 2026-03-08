const axios = require('axios');
const fs = require('fs');

const BASE_URL = 'http://miniproject.local/api/v1';

async function runTests() {
    console.log('--- Starting Issue 16 & 4 E2E Verification Workflow (Auto-Registration) ---');

    const studentToken = fs.readFileSync('.e2e_student_token', 'utf8').trim();
    const studentObj = JSON.parse(Buffer.from(studentToken.split('.')[1], 'base64').toString());

    console.log(`\nVerified Temp Student ID (Keycloak sub): ${studentObj.sub}`);
    console.log(`Expected Email: student@test.com`);

    try {
        console.log('\n--- 1. Testing Protected User Profile Auto-Sync (GET /me) ---');
        console.log(`REQ: GET ${BASE_URL}/user-service/users/me`);
        const meRes = await axios.get(`${BASE_URL}/user-service/users/me`, {
            headers: { Authorization: `Bearer ${studentToken}` }
        });

        console.log(`[PASS] Received ${meRes.status} OK.`);
        console.log(`Profile synced to MongoDB successfully.`);
        console.log(`Synced Document ID (Keycloak Sub):`, meRes.data.keycloakId);
        console.log(`Synced Display Name:`, meRes.data.name);
        console.log(`Synced Email:`, meRes.data.email);
        console.log(`Synced Verified Roles:`, meRes.data.role);

        if (meRes.data.email !== "student@test.com" || meRes.data.keycloakId !== studentObj.sub) {
            console.error('\n❌ [FAIL] The data synced into MongoDB does not match the JWT payload! Synced data is corrupted.');
            process.exit(1);
        }

        console.log('\n--- 2. Re-Testing Protected User Profile Sync (Idempotent Check) ---');
        console.log(`REQ: GET ${BASE_URL}/user-service/users/me`);
        const meRes2 = await axios.get(`${BASE_URL}/user-service/users/me`, {
            headers: { Authorization: `Bearer ${studentToken}` }
        });

        console.log(`[PASS] Received ${meRes2.status} OK again.`);
        console.log(`The upsert logic handles existing users without throwing duplicate key limits.`);

        console.log('\n✅ Issue 16 (Missing auto-registration hook) and Issue 4 (Missing MongoDB Profile) are successfully fixed. Users are lazily provisioned in MongoDB seamlessly on their first app access without receiving a 404.');

    } catch (err) {
        console.error(`\n❌ [FAIL] Test encountered an error:`);
        console.error(`URL that failed:`, err.config?.url);
        console.error(`Status code:`, err.response?.status);
        console.error(`Axios Error Detail:`, err.message);
        console.error(`Response Header:`, JSON.stringify(err.response?.headers, null, 2));
        console.error(`Response data:`, JSON.stringify(err.response?.data, null, 2));

        if (err.response?.status === 404) {
            console.error('\n❌ [CRITICAL] Issue 16 & 4 is NOT FIXED. The user was not automatically created in MongoDB, resulting in a 404 Not Found rather than a seamless provisioning.');
        }
        process.exit(1);
    }
}

runTests();
