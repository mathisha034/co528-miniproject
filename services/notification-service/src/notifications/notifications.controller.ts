import {
    Controller, Get, Post, Patch, Query,
    Param, Body, UseGuards, Request,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/notification.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    /**
     * REST trigger for external services (job/feed/event) to emit notifications.
     * Accepts the full CreateNotificationDto — caller MUST supply idempotencyKey.
     */
    @Post('notify')
    async notify(@Body() dto: CreateNotificationDto) {
        return this.notificationsService.create(dto);
    }

    /** Emit an internal event (used for testing event listener wiring). */
    @Post('emit/:event')
    async emitEvent(@Param('event') event: string, @Body() payload: Record<string, unknown>) {
        this.eventEmitter.emit(`notification.${event}`, payload);
        return { emitted: `notification.${event}` };
    }

    /** GET inbox — optionally filter to unread only via ?unread=true */
    @Get()
    async getMyNotifications(
        @Request() req,
        @Query('unread') unread?: string,
    ) {
        return this.notificationsService.findForUser(
            req.user.sub,
            unread === 'true',
        );
    }

    /** Mark a single notification as read */
    @Patch(':id/read')
    async markRead(@Param('id') id: string, @Request() req) {
        return this.notificationsService.markRead(id, req.user.sub);
    }

    /** Mark all notifications as read */
    @Patch('read-all')
    async markAllRead(@Request() req) {
        return this.notificationsService.markAllRead(req.user.sub);
    }
}
