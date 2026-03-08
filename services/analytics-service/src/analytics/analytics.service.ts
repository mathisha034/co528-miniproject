import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as http from 'http';

@Injectable()
export class AnalyticsService {
    constructor(
        @InjectConnection() private readonly connection: Connection,
    ) { }

    // Safe db accessor — satisfies TS strict-null checks
    private getDb() {
        const db = this.connection.db;
        if (!db) throw new Error('[analytics-service] MongoDB db not available');
        return db;
    }

    // ── GET /api/v1/analytics/overview ─────────────────────────────────────────
    // G7.1: Extended response includes totalUsers, openJobs, activeResearch
    async getOverview() {
        const db = this.getDb();
        const [users, posts, jobs, events, openJobs, activeResearch] = await Promise.all([
            db.collection('users').countDocuments(),
            db.collection('posts').countDocuments(),
            db.collection('jobs').countDocuments(),
            db.collection('evententities').countDocuments(),
            // G7.1: open jobs only
            db.collection('jobs').countDocuments({ status: 'open' }),
            // G7.1: active research projects
            db.collection('researches').countDocuments({ status: 'active' }),
        ]);
        return {
            // existing fields (backward compat)
            users,
            posts,
            jobs,
            events,
            // G7.1: scenario-specified named keys
            totalUsers: users,
            openJobs,
            activeResearch,
        };
    }

    // ── GET /api/v1/analytics/posts ────────────────────────────────────────────
    async getPopularPosts(limit = 5) {
        const db = this.getDb();
        return db
            .collection('posts')
            .aggregate([
                {
                    $project: {
                        _id: 1,
                        content: 1,
                        userId: 1,
                        likeCount: { $size: { $ifNull: ['$likes', []] } },
                        commentCount: { $ifNull: ['$commentCount', 0] },
                        createdAt: 1,
                    },
                },
                { $sort: { likeCount: -1, commentCount: -1 } },
                { $limit: limit },
            ])
            .toArray();
    }

    // ── GET /api/v1/analytics/jobs ─────────────────────────────────────────────
    async getJobApplicationCounts() {
        const db = this.getDb();
        return db
            .collection('applications')
            .aggregate([
                { $group: { _id: '$jobId', applicationCount: { $sum: 1 } } },
                { $sort: { applicationCount: -1 } },
            ])
            .toArray();
    }

    // ── GET /api/v1/analytics/users ────────────────────────────────────────────
    async getUserRegistrations(days = 30) {
        const db = this.getDb();
        const since = new Date();
        since.setDate(since.getDate() - days);
        return db
            .collection('users')
            .aggregate([
                { $match: { createdAt: { $gte: since } } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        count: { $sum: 1 },
                    },
                },
                { $sort: { _id: 1 } },
            ])
            .toArray();
    }

    // ── Prometheus HTTP API ─────────────────────────────────────────────────────
    async getPrometheusMetrics(query: string): Promise<any> {
        const prometheusUrl = process.env.PROMETHEUS_URL || 'http://prometheus:9090';
        const url = `${prometheusUrl}/api/v1/query?query=${encodeURIComponent(query)}`;

        return new Promise((resolve) => {
            http
                .get(url, (res) => {
                    let data = '';
                    res.on('data', (chunk) => (data += chunk));
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            resolve({ status: 'error', data: [] });
                        }
                    });
                })
                .on('error', (err) => {
                    console.warn('[analytics-service] Prometheus unreachable:', err.message);
                    resolve({ status: 'error', data: [] });
                });
        });
    }

    // ── Service latency from Prometheus ────────────────────────────────────────
    async getServiceLatencies() {
        return this.getPrometheusMetrics(
            'histogram_quantile(0.95, sum(rate({__name__=~".*http_request_duration_ms_bucket"}[5m])) by (le, service))',
        );
    }
}
