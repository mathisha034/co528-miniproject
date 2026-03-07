import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '20s', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

const BASE_URL = __ENV.API_URL || 'http://user-service:3001/api/v1';

export default function () {
  const req = http.get(`${BASE_URL}/health`, {
    headers: { 'Host': 'api.miniproject.local' },
  });
  check(req, {
    'status 200': (r) => r.status === 200,
  });
  sleep(1);
}
