import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/notification.dto';
import { withRetry } from '../common/retry.util';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) { }

  /**
   * Create a notification with idempotency enforcement.
   * If an identical idempotencyKey already exists, silently returns the existing
   * notification (no duplicate, no error thrown to caller).
   */
  async create(dto: CreateNotificationDto): Promise<NotificationDocument> {
    return withRetry(
      async () => {
        // Check idempotency first
        const existing = await this.notificationModel.findOne({
          idempotencyKey: dto.idempotencyKey,
        });
        if (existing) {
          this.logger.debug(
            `Duplicate notification skipped [key=${dto.idempotencyKey}]`,
          );
          return existing;
        }

        return this.notificationModel.create({
          userId: dto.userId,
          type: dto.type,
          message: dto.message,
          idempotencyKey: dto.idempotencyKey,
          metadata: dto.metadata ?? {},
        });
      },
      3, // maxRetries
      100, // baseDelayMs (short for in-service calls)
    );
  }

  /**
   * Get all notifications for a user, newest first.
   * Optionally filter by unread only.
   */
  async findForUser(
    userId: string,
    unreadOnly = false,
  ): Promise<NotificationDocument[]> {
    const filter: Record<string, unknown> = {
      userId: userId,
    };
    if (unreadOnly) filter.read = false;
    return this.notificationModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  /** Count all unread notifications for a user. */
  async countUnread(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({
      userId: userId,
      read: false,
    });
  }

  /** Mark a single notification as read. */
  async markRead(
    notificationId: string,
    userId: string,
  ): Promise<NotificationDocument | null> {
    const updated = await this.notificationModel.findOneAndUpdate(
      { _id: notificationId, userId: userId },
      { $set: { read: true } },
      { new: true },
    );
    if (!updated) {
      throw new NotFoundException('Notification not found or unauthorized');
    }
    return updated;
  }

  /** Mark all notifications for a user as read. */
  async markAllRead(userId: string): Promise<{ modified: number }> {
    const result = await this.notificationModel.updateMany(
      { userId: userId, read: false },
      { $set: { read: true } },
    );
    return { modified: result.modifiedCount };
  }

  /** Internal: create a notification from an event (used by listener). */
  async createFromEvent(
    userId: string,
    type: NotificationType,
    message: string,
    idempotencyKey: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    try {
      await this.create({ userId, type, message, idempotencyKey, metadata });
    } catch (err) {
      this.logger.error(
        `Failed to create notification: ${(err as Error).message}`,
      );
    }
  }
}
