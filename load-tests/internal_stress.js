import http from 'k6/http';
import { check, sleep } from 'k6';

// Run against internal cluster load testing
export const options = {
    stages: [
        { duration: '30s', target: 50 },  // Ramp-up to 50 users
        { duration: '60s', target: 500 }, // Spike to 500 to trigger HPA
        { duration: '30s', target: 500 }, // Hold 500
        { duration: '30s', target: 0 },   // Ramp-down
    ],
    thresholds: {
        http_req_duration: ['p(95)<1000'], // Allows slightly higher latency under load
        http_req_failed: ['rate<0.05'],   // Max 5% failure rate acceptable during stress
    },
};

export default function () {
    // Hit health endpoints dynamically to simulate internal distributed load
    const services = [
        { name: 'user-service', port: 3001 },
        { name: 'feed-service', port: 3002 },
        { name: 'job-service', port: 3003 },
        { name: 'event-service', port: 3004 },
        { name: 'notification-service', port: 3006 },
        { name: 'messaging-service', port: 3005 },
        { name: 'research-service', port: 3007 },
        { name: 'analytics-service', port: 3008 },
    ];

    const target = services[Math.floor(Math.random() * services.length)];
    const url = `http://${target.name}:${target.port}/api/v1/health`;

    const res = http.get(url);
    check(res, {
        'is status 200': (r) => r.status === 200,
    });

    sleep(1);
}
