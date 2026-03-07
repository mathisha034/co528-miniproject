import { Test, TestingModule } from '@nestjs/testing';
import { JobsService } from './jobs.service';
import { getModelToken } from '@nestjs/mongoose';
import { Job, JobStatus } from './schemas/job.schema';
import { Application, ApplicationStatus } from './schemas/application.schema';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const VALID_ID = '507f1f77bcf86cd799439011';

const mockJobModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
};
const mockAppModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
};

describe('JobsService', () => {
    let service: JobsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                JobsService,
                { provide: getModelToken(Job.name), useValue: mockJobModel },
                { provide: getModelToken(Application.name), useValue: mockAppModel },
            ],
        }).compile();
        service = module.get<JobsService>(JobsService);
        jest.clearAllMocks();
    });

    describe('findById', () => {
        it('should return job when found', async () => {
            mockJobModel.findById.mockResolvedValue({ _id: VALID_ID, title: 'Dev' });
            const result = await service.findById(VALID_ID);
            expect(result.title).toBe('Dev');
        });
        it('should throw NotFoundException when not found', async () => {
            mockJobModel.findById.mockResolvedValue(null);
            await expect(service.findById(VALID_ID)).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateStatus — job transitions', () => {
        it('should allow open → closed', async () => {
            const mockJob = { status: JobStatus.OPEN, save: jest.fn().mockResolvedValue({ status: JobStatus.CLOSED }) };
            mockJobModel.findById.mockResolvedValue(mockJob);
            const result = await service.updateStatus(VALID_ID, { status: JobStatus.CLOSED });
            expect(mockJob.save).toHaveBeenCalled();
        });

        it('should reject closed → open (invalid transition)', async () => {
            mockJobModel.findById.mockResolvedValue({ status: JobStatus.CLOSED, save: jest.fn() });
            await expect(service.updateStatus(VALID_ID, { status: JobStatus.OPEN }))
                .rejects.toThrow(BadRequestException);
        });
    });

    describe('updateApplicationStatus — app transitions', () => {
        it('should allow pending → reviewed', async () => {
            const mockApp = { status: ApplicationStatus.PENDING, save: jest.fn().mockResolvedValue({ status: ApplicationStatus.REVIEWED }) };
            mockAppModel.findOne.mockResolvedValue(mockApp);
            await service.updateApplicationStatus(VALID_ID, VALID_ID, { status: ApplicationStatus.REVIEWED });
            expect(mockApp.save).toHaveBeenCalled();
        });

        it('should reject accepted → pending (invalid transition)', async () => {
            mockAppModel.findOne.mockResolvedValue({ status: ApplicationStatus.ACCEPTED, save: jest.fn() });
            await expect(
                service.updateApplicationStatus(VALID_ID, VALID_ID, { status: ApplicationStatus.PENDING }),
            ).rejects.toThrow(BadRequestException);
        });

        it('should throw NotFoundException if application not found', async () => {
            mockAppModel.findOne.mockResolvedValue(null);
            await expect(
                service.updateApplicationStatus(VALID_ID, VALID_ID, { status: ApplicationStatus.REVIEWED }),
            ).rejects.toThrow(NotFoundException);
        });
    });
});
