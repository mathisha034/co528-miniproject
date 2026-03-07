import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

export enum NotificationType {
    JOB_APPLIED = 'job_applied',
    JOB_STATUS_CHANGED = 'job_status_changed',
    EVENT_RSVP = 'event_rsvp',
    EVENT_STATUS_CHANGED = 'event_status_changed',
    POST_LIKED = 'post_liked',
    GENERAL = 'general',
}

@Schema({ timestamps: true })
export class Notification {
    @Prop({ required: true, type: Types.ObjectId, index: true })
    userId: Types.ObjectId;

    @Prop({ required: true, type: String, enum: NotificationType })
    type: NotificationType;

    @Prop({ required: true })
    message: string;

    @Prop({ default: false, index: true })
    read: boolean;

    /**
     * Idempotency key: prevents duplicate notifications.
     * Callers should pass a deterministic key, e.g. `job_applied:{jobId}:{applicantId}`.
     */
    @Prop({ required: true, unique: true })
    idempotencyKey: string;

    @Prop({ type: Object, default: {} })
    metadata: Record<string, unknown>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Compound index for fast user inbox queries
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
