import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { getModelToken } from '@nestjs/mongoose';
import { Notification, NotificationType } from './schemas/notification.schema';

const VALID_ID = '507f1f77bcf86cd799439011';
const VALID_ID2 = '507f191e810c19729de860ea';

const mockNotificationModel = {
  findOne: jest.fn(),
  create: jest.fn(),
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateMany: jest.fn(),
};

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: getModelToken(Notification.name),
          useValue: mockNotificationModel,
        },
      ],
    }).compile();
    service = module.get<NotificationsService>(NotificationsService);
    jest.clearAllMocks();
  });

  // ─── 2.4.c  Idempotency ───────────────────────────────────────────────────

  describe('create — idempotency', () => {
    const baseDto = {
      userId: VALID_ID,
      type: NotificationType.JOB_APPLIED,
      message: 'Test',
      idempotencyKey: 'job_applied:abc:def',
    };

    it('should create notification when key is new', async () => {
      mockNotificationModel.findOne.mockResolvedValue(null);
      mockNotificationModel.create.mockResolvedValue({
        ...baseDto,
        _id: VALID_ID2,
      });
      const result = await service.create(baseDto);
      expect(mockNotificationModel.create).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty('idempotencyKey', 'job_applied:abc:def');
    });

    it('should return existing notification and NOT create duplicate when key exists', async () => {
      const existing = { ...baseDto, _id: VALID_ID2, read: false };
      mockNotificationModel.findOne.mockResolvedValue(existing);
      const result = await service.create(baseDto);
      expect(mockNotificationModel.create).not.toHaveBeenCalled();
      expect(result).toEqual(existing);
    });

    it('should create two notifications for different idempotency keys', async () => {
      mockNotificationModel.findOne.mockResolvedValue(null);
      mockNotificationModel.create
        .mockResolvedValueOnce({ ...baseDto, idempotencyKey: 'key-1' })
        .mockResolvedValueOnce({ ...baseDto, idempotencyKey: 'key-2' });

      await service.create({ ...baseDto, idempotencyKey: 'key-1' });
      await service.create({ ...baseDto, idempotencyKey: 'key-2' });
      expect(mockNotificationModel.create).toHaveBeenCalledTimes(2);
    });
  });

  // ─── 2.4.d  Retry ─────────────────────────────────────────────────────────

  describe('create — retry', () => {
    it('should retry on transient failure and succeed on 2nd attempt', async () => {
      mockNotificationModel.findOne
        .mockRejectedValueOnce(new Error('transient DB error'))
        .mockResolvedValue(null);
      mockNotificationModel.create.mockResolvedValue({ _id: VALID_ID });

      const result = await service.create({
        userId: VALID_ID,
        type: NotificationType.GENERAL,
        message: 'Retry test',
        idempotencyKey: 'retry-key',
      });
      expect(result).toHaveProperty('_id');
      expect(mockNotificationModel.findOne).toHaveBeenCalledTimes(2);
    }, 1000);

    it('should throw after 3 failed attempts', async () => {
      mockNotificationModel.findOne.mockRejectedValue(
        new Error('persistent DB error'),
      );
      await expect(
        service.create({
          userId: VALID_ID,
          type: NotificationType.GENERAL,
          message: 'Fail test',
          idempotencyKey: 'fail-key',
        }),
      ).rejects.toThrow('persistent DB error');
      expect(mockNotificationModel.findOne).toHaveBeenCalledTimes(3);
    }, 2000);
  });

  // ─── 2.4.a  Inbox queries ─────────────────────────────────────────────────

  describe('findForUser', () => {
    it('should return all notifications for a user', async () => {
      const fakeExec = jest.fn().mockResolvedValue([{ message: 'n1' }]);
      mockNotificationModel.find.mockReturnValue({
        sort: () => ({ exec: fakeExec }),
      });
      const result = await service.findForUser(VALID_ID);
      expect(result).toHaveLength(1);
    });
  });

  describe('markAllRead', () => {
    it('should return count of modified documents', async () => {
      mockNotificationModel.updateMany.mockResolvedValue({ modifiedCount: 5 });
      const result = await service.markAllRead(VALID_ID);
      expect(result).toEqual({ modified: 5 });
    });
  });
});
