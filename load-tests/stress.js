import http from 'k6/http';
import { check, sleep } from 'k6';

// Run against internal cluster load testing or against localhost using ingress PortForward
export const options = {
    stages: [
        { duration: '15s', target: 50 },  // Ramp-up to 50 users
        { duration: '30s', target: 50 },  // Stay at 50 to get baseline
        { duration: '30s', target: 500 }, // Spike to 500 to trigger HPA
        { duration: '30s', target: 500 }, // Hold 500
        { duration: '30s', target: 0 },   // Ramp-down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'], // 95% of requests should be < 500ms
        http_req_failed: ['rate<0.01'],   // Error rate should be < 1%
    },
};

const BASE_URL = __ENV.API_URL || 'http://miniproject.local/api/v1';

export default function () {
    // Hit health endpoints dynamically to simulate internal distributed load
    const services = [
        'user-service', 'feed-service', 'job-service',
        'event-service', 'notification-service', 'messaging-service',
        'research-service', 'analytics-service'
    ];
    const target = services[Math.floor(Math.random() * services.length)];

    const res = http.get(`${BASE_URL}/${target}/health`);
    check(res, {
        'is status 200': (r) => r.status === 200,
    });

    sleep(1);
}
