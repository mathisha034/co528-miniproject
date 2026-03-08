import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/notification.dto';

@Controller('internal/notifications')
export class InternalController {
    constructor(private readonly notificationsService: NotificationsService) { }

    @Post('notify')
    async notify(
        @Headers('x-internal-token') token: string,
        @Body() dto: CreateNotificationDto,
    ) {
        // In a real system, use an injected ConfigService with process.env.INTERNAL_TOKEN
        const validToken = process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
        if (token !== validToken) {
            throw new UnauthorizedException('Invalid cross-service authentication token');
        }
        return this.notificationsService.create(dto);
    }
}
