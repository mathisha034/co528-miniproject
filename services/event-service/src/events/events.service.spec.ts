import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { getModelToken } from '@nestjs/mongoose';
import { EventEntity, EventStatus } from './schemas/event.schema';
import { BadRequestException, NotFoundException } from '@nestjs/common';

const VALID_ID = '507f1f77bcf86cd799439011';

const mockEventModel = {
    create: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
};

describe('EventsService', () => {
    let service: EventsService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                EventsService,
                { provide: getModelToken(EventEntity.name), useValue: mockEventModel },
            ],
        }).compile();
        service = module.get<EventsService>(EventsService);
        jest.clearAllMocks();
    });

    describe('findById', () => {
        it('should return event when found', async () => {
            mockEventModel.findById.mockResolvedValue({ _id: VALID_ID, title: 'Hackathon' });
            const result = await service.findById(VALID_ID);
            expect(result.title).toBe('Hackathon');
        });
        it('should throw NotFoundException when not found', async () => {
            mockEventModel.findById.mockResolvedValue(null);
            await expect(service.findById(VALID_ID)).rejects.toThrow(NotFoundException);
        });
    });

    describe('updateStatus — event transitions', () => {
        it('should allow upcoming → live', async () => {
            const mockEvent = { status: EventStatus.UPCOMING, save: jest.fn().mockResolvedValue({ status: EventStatus.LIVE }) };
            mockEventModel.findById.mockResolvedValue(mockEvent);
            const result = await service.updateStatus(VALID_ID, { status: EventStatus.LIVE });
            expect(mockEvent.save).toHaveBeenCalled();
        });

        it('should allow live → ended', async () => {
            const mockEvent = { status: EventStatus.LIVE, save: jest.fn().mockResolvedValue({ status: EventStatus.ENDED }) };
            mockEventModel.findById.mockResolvedValue(mockEvent);
            await service.updateStatus(VALID_ID, { status: EventStatus.ENDED });
            expect(mockEvent.save).toHaveBeenCalled();
        });

        it('should reject ended → upcoming (invalid, backward)', async () => {
            mockEventModel.findById.mockResolvedValue({ status: EventStatus.ENDED, save: jest.fn() });
            await expect(service.updateStatus(VALID_ID, { status: EventStatus.UPCOMING }))
                .rejects.toThrow(BadRequestException);
        });

        it('should reject upcoming → ended (skip live)', async () => {
            mockEventModel.findById.mockResolvedValue({ status: EventStatus.UPCOMING, save: jest.fn() });
            await expect(service.updateStatus(VALID_ID, { status: EventStatus.ENDED }))
                .rejects.toThrow(BadRequestException);
        });
    });

    describe('rsvp', () => {
        it('should throw BadRequestException for ended event', async () => {
            mockEventModel.findById.mockResolvedValue({ status: EventStatus.ENDED, rsvps: [] });
            await expect(service.rsvp(VALID_ID, VALID_ID)).rejects.toThrow(BadRequestException);
        });

        it('should add userId to rsvps for upcoming event', async () => {
            mockEventModel.findById.mockResolvedValue({ status: EventStatus.UPCOMING, rsvps: [] });
            mockEventModel.findByIdAndUpdate.mockReturnValue({
                exec: jest.fn().mockResolvedValue({ rsvps: [VALID_ID] }),
            });
            const result = await service.rsvp(VALID_ID, VALID_ID);
            expect(mockEventModel.findByIdAndUpdate).toHaveBeenCalledWith(
                VALID_ID,
                { $addToSet: { rsvps: expect.anything() } },
                { new: true },
            );
        });
    });
});
