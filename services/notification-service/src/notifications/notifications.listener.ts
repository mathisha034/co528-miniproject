import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './schemas/notification.schema';

/**
 * Async event listener for internal notification triggers.
 * Uses NestJS EventEmitter (in-process pub/sub) for decoupled event handling.
 *
 * Any service within notification-service can emit events via EventEmitter2.
 * External services (job-service, feed-service, etc.) trigger via REST POST /notify.
 *
 * Event payload shape: { userId, message, metadata?, idempotencyKey? }
 */
@Injectable()
export class NotificationsListener {
    private readonly logger = new Logger(NotificationsListener.name);

    constructor(private readonly notificationsService: NotificationsService) { }

    @OnEvent('notification.job.applied')
    async handleJobApplied(payload: {
        userId: string;
        jobId: string;
        applicantId: string;
    }) {
        this.logger.log(`Event: job.applied for user ${payload.userId}`);
        await this.notificationsService.createFromEvent(
            payload.userId,
            NotificationType.JOB_APPLIED,
            `A new application was received for your job posting.`,
            `job_applied:${payload.jobId}:${payload.applicantId}`,
            { jobId: payload.jobId, applicantId: payload.applicantId },
        );
    }

    @OnEvent('notification.job.status_changed')
    async handleJobStatusChanged(payload: {
        userId: string;
        jobId: string;
        status: string;
    }) {
        this.logger.log(`Event: job.status_changed for user ${payload.userId}`);
        await this.notificationsService.createFromEvent(
            payload.userId,
            NotificationType.JOB_STATUS_CHANGED,
            `Your job application status changed to: ${payload.status}.`,
            `job_status_changed:${payload.jobId}:${payload.userId}:${payload.status}`,
            { jobId: payload.jobId, status: payload.status },
        );
    }

    @OnEvent('notification.event.rsvp')
    async handleEventRsvp(payload: {
        userId: string;
        eventId: string;
        attendeeId: string;
    }) {
        this.logger.log(`Event: event.rsvp for user ${payload.userId}`);
        await this.notificationsService.createFromEvent(
            payload.userId,
            NotificationType.EVENT_RSVP,
            `A new RSVP was received for your event.`,
            `event_rsvp:${payload.eventId}:${payload.attendeeId}`,
            { eventId: payload.eventId, attendeeId: payload.attendeeId },
        );
    }

    @OnEvent('notification.post.liked')
    async handlePostLiked(payload: {
        userId: string;
        postId: string;
        likerId: string;
    }) {
        this.logger.log(`Event: post.liked for user ${payload.userId}`);
        await this.notificationsService.createFromEvent(
            payload.userId,
            NotificationType.POST_LIKED,
            `Someone liked your post.`,
            `post_liked:${payload.postId}:${payload.likerId}`,
            { postId: payload.postId, likerId: payload.likerId },
        );
    }
}
