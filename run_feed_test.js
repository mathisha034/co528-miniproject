const axios = require('axios');
const fs = require('fs');
async function test() {
  const token = fs.readFileSync('.e2e_token', 'utf8').trim();
  try {
    const feedRes = await axios.get(`http://miniproject.local/api/v1/feed-service/feed`, { headers: { Authorization: `Bearer ${token}` } });
    console.log(feedRes.data);
  } catch(e) { console.error(e.response ? e.response.data : e.message); }
}
test();
