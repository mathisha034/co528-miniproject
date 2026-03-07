import { IsString, IsEnum, IsOptional, IsObject } from 'class-validator';
import { NotificationType } from '../schemas/notification.schema';

export class CreateNotificationDto {
  @IsString()
  userId: string;

  @IsEnum(NotificationType)
  type: NotificationType;

  @IsString()
  message: string;

  @IsString()
  idempotencyKey: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class MarkReadDto {
  @IsString()
  notificationId: string;
}
