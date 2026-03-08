import { Test, TestingModule } from '@nestjs/testing';
import { ResearchService } from './research.service';
import { getModelToken } from '@nestjs/mongoose';
import { Research } from './schemas/research.schema';
import {
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';

const VALID_ID = '507f1f77bcf86cd799439011';
const OWNER_ID = 'owner-user-id';
const OTHER_ID = 'other-user-id';
const COLLAB_ID = 'collab-user-id';

// Helper to build a mock project doc
function mockProject(overrides = {}) {
    return {
        _id: VALID_ID,
        ownerId: OWNER_ID,
        collaborators: [] as string[],
        documents: [] as any[],
        status: 'active',
        save: jest.fn().mockImplementation(function () {
            return Promise.resolve(this);
        }),
        ...overrides,
    };
}

const mockResearchModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn(),
};

// Prevent actual MinIO connection in tests
jest.mock('minio', () => ({
    Client: jest.fn().mockImplementation(() => ({
        bucketExists: jest.fn().mockResolvedValue(true),
        makeBucket: jest.fn().mockResolvedValue(undefined),
        putObject: jest.fn().mockResolvedValue(undefined),
    })),
}));

describe('ResearchService', () => {
    let service: ResearchService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ResearchService,
                { provide: getModelToken(Research.name), useValue: mockResearchModel },
            ],
        }).compile();
        service = module.get<ResearchService>(ResearchService);
        jest.clearAllMocks();
    });

    // ── Schema & Create ─────────────────────────────────────────────────────────
    describe('create', () => {
        it('should create a project with ownerId', async () => {
            const project = { title: 'AI Research', ownerId: OWNER_ID };
            mockResearchModel.create.mockResolvedValue(project);
            const result = await service.create(OWNER_ID, { title: 'AI Research' });
            expect(mockResearchModel.create).toHaveBeenCalledWith(
                expect.objectContaining({ ownerId: OWNER_ID, title: 'AI Research' }),
            );
            expect(result.title).toBe('AI Research');
        });
    });

    // ── findById ─────────────────────────────────────────────────────────────────
    describe('findById', () => {
        it('should return project when found', async () => {
            mockResearchModel.findById.mockResolvedValue(mockProject());
            const result = await service.findById(VALID_ID);
            expect(result.ownerId).toBe(OWNER_ID);
        });

        it('should throw NotFoundException when not found', async () => {
            mockResearchModel.findById.mockResolvedValue(null);
            await expect(service.findById(VALID_ID)).rejects.toThrow(NotFoundException);
        });
    });

    // ── update ───────────────────────────────────────────────────────────────────
    describe('update', () => {
        it('should allow owner to update', async () => {
            const project = mockProject();
            mockResearchModel.findById.mockResolvedValue(project);
            await service.update(VALID_ID, OWNER_ID, { status: 'completed' as any });
            expect(project.save).toHaveBeenCalled();
        });

        it('should throw ForbiddenException for non-owner', async () => {
            mockResearchModel.findById.mockResolvedValue(mockProject());
            await expect(
                service.update(VALID_ID, OTHER_ID, { title: 'Hacked' }),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    // ── inviteCollaborator ───────────────────────────────────────────────────────
    describe('inviteCollaborator', () => {
        it('owner can invite a collaborator', async () => {
            const project = mockProject();
            mockResearchModel.findById.mockResolvedValue(project);
            await service.inviteCollaborator(VALID_ID, OWNER_ID, { userId: COLLAB_ID });
            expect(project.collaborators).toContain(COLLAB_ID);
            expect(project.save).toHaveBeenCalled();
        });

        it('non-owner cannot invite', async () => {
            mockResearchModel.findById.mockResolvedValue(mockProject());
            await expect(
                service.inviteCollaborator(VALID_ID, OTHER_ID, { userId: COLLAB_ID }),
            ).rejects.toThrow(ForbiddenException);
        });

        it('invite is idempotent (no duplicates)', async () => {
            const project = mockProject({ collaborators: [COLLAB_ID] });
            mockResearchModel.findById.mockResolvedValue(project);
            await service.inviteCollaborator(VALID_ID, OWNER_ID, { userId: COLLAB_ID });
            expect(project.collaborators.filter((id) => id === COLLAB_ID)).toHaveLength(1);
        });
    });

    // ── removeCollaborator ───────────────────────────────────────────────────────
    describe('removeCollaborator', () => {
        it('owner can remove an existing collaborator', async () => {
            const project = mockProject({ collaborators: [COLLAB_ID] });
            mockResearchModel.findById.mockResolvedValue(project);
            await service.removeCollaborator(VALID_ID, OWNER_ID, COLLAB_ID);
            expect(project.collaborators).not.toContain(COLLAB_ID);
        });

        it('throws NotFoundException for non-existent collaborator', async () => {
            mockResearchModel.findById.mockResolvedValue(mockProject());
            await expect(
                service.removeCollaborator(VALID_ID, OWNER_ID, 'no-one'),
            ).rejects.toThrow(NotFoundException);
        });

        it('non-owner cannot remove collaborator', async () => {
            mockResearchModel.findById.mockResolvedValue(
                mockProject({ collaborators: [COLLAB_ID] }),
            );
            await expect(
                service.removeCollaborator(VALID_ID, OTHER_ID, COLLAB_ID),
            ).rejects.toThrow(ForbiddenException);
        });
    });

    // ── uploadDocument ───────────────────────────────────────────────────────────
    describe('uploadDocument', () => {
        const mockFile: Express.Multer.File = {
            originalname: 'paper.pdf',
            buffer: Buffer.from('data'),
            mimetype: 'application/pdf',
            size: 4,
            fieldname: 'file',
            encoding: '7bit',
            stream: null as any,
            destination: '',
            filename: '',
            path: '',
        };

        it('owner can upload a document', async () => {
            const project = mockProject();
            mockResearchModel.findById.mockResolvedValue(project);
            const result = await service.uploadDocument(VALID_ID, OWNER_ID, mockFile);
            expect(project.documents).toHaveLength(1);
            expect(project.documents[0].name).toBe('paper.pdf');
        });

        it('collaborator can upload a document', async () => {
            const project = mockProject({ collaborators: [COLLAB_ID] });
            mockResearchModel.findById.mockResolvedValue(project);
            await service.uploadDocument(VALID_ID, COLLAB_ID, mockFile);
            expect(project.documents).toHaveLength(1);
        });

        it('non-member cannot upload', async () => {
            mockResearchModel.findById.mockResolvedValue(mockProject());
            await expect(
                service.uploadDocument(VALID_ID, OTHER_ID, mockFile),
            ).rejects.toThrow(ForbiddenException);
        });
    });
});
