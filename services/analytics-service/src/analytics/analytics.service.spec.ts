import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { getConnectionToken } from '@nestjs/mongoose';

// ── Mock data ─────────────────────────────────────────────────────────────────
const mockUsers = [
    { _id: '1', createdAt: new Date() },
    { _id: '2', createdAt: new Date() },
];
const mockPosts = [
    { _id: '1', content: 'Hello', likes: ['a', 'b'], commentCount: 3, createdAt: new Date() },
    { _id: '2', content: 'World', likes: [], commentCount: 0, createdAt: new Date() },
];
const mockApplications = [
    { jobId: 'job1', applicantId: 'u1' },
    { jobId: 'job1', applicantId: 'u2' },
    { jobId: 'job2', applicantId: 'u1' },
];

// ── Mock MongoDB connection ───────────────────────────────────────────────────
function makeCollection(docs: any[]) {
    return {
        countDocuments: jest.fn().mockResolvedValue(docs.length),
        aggregate: jest.fn().mockReturnValue({
            toArray: jest.fn().mockResolvedValue(docs),
        }),
    };
}

const mockDb = {
    collection: jest.fn((name: string) => {
        if (name === 'users') return makeCollection(mockUsers);
        if (name === 'posts') return makeCollection(mockPosts);
        if (name === 'jobs') return makeCollection([]);
        if (name === 'events') return makeCollection([]);
        if (name === 'applications') return makeCollection(mockApplications);
        return makeCollection([]);
    }),
};

const mockConnection = { db: mockDb };

describe('AnalyticsService', () => {
    let service: AnalyticsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AnalyticsService,
                {
                    provide: getConnectionToken(),
                    useValue: mockConnection,
                },
            ],
        }).compile();
        service = module.get<AnalyticsService>(AnalyticsService);
        jest.clearAllMocks();
    });

    // ── overview ─────────────────────────────────────────────────────────────────
    describe('getOverview', () => {
        it('should return correct shape { users, posts, jobs, events }', async () => {
            const result = await service.getOverview();
            expect(result).toEqual(
                expect.objectContaining({
                    users: expect.any(Number),
                    posts: expect.any(Number),
                    jobs: expect.any(Number),
                    events: expect.any(Number),
                }),
            );
        });

        it('should return user count matching mocked data', async () => {
            const result = await service.getOverview();
            expect(result.users).toBe(mockUsers.length);
        });
    });

    // ── popular posts ─────────────────────────────────────────────────────────────
    describe('getPopularPosts', () => {
        it('should return an array of posts', async () => {
            mockDb.collection.mockReturnValueOnce(makeCollection(mockPosts));
            const result = await service.getPopularPosts(5);
            expect(Array.isArray(result)).toBe(true);
        });

        it('should call aggregate on posts collection', async () => {
            const postCollection = makeCollection(mockPosts);
            mockDb.collection.mockReturnValueOnce(postCollection);
            await service.getPopularPosts(5);
            expect(postCollection.aggregate).toHaveBeenCalled();
        });
    });

    // ── job application counts ───────────────────────────────────────────────────
    describe('getJobApplicationCounts', () => {
        it('should return an array from applications collection', async () => {
            const appCollection = makeCollection(mockApplications);
            mockDb.collection.mockReturnValue(appCollection);
            const result = await service.getJobApplicationCounts();
            expect(Array.isArray(result)).toBe(true);
        });
    });

    // ── user registrations ────────────────────────────────────────────────────────
    describe('getUserRegistrations', () => {
        it('should call aggregate on users collection', async () => {
            const userCollection = makeCollection(mockUsers);
            mockDb.collection.mockReturnValueOnce(userCollection);
            await service.getUserRegistrations(30);
            expect(userCollection.aggregate).toHaveBeenCalled();
        });

        it('should return array ', async () => {
            mockDb.collection.mockReturnValue(makeCollection(mockUsers));
            const result = await service.getUserRegistrations(7);
            expect(Array.isArray(result)).toBe(true);
        });
    });

    // ── Prometheus query ──────────────────────────────────────────────────────────
    describe('getPrometheusMetrics', () => {
        it('should return error status gracefully when Prometheus is unreachable', async () => {
            const result = await service.getPrometheusMetrics('up');
            // In tests Prometheus is not running, expects graceful fallback
            expect(result).toHaveProperty('status');
        });
    });
});
