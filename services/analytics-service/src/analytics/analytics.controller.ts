import {
    BadRequestException,
    Controller,
    Get,
    Query,
    UseGuards,
} from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
    constructor(private readonly analyticsService: AnalyticsService) { }

    // G7.2: Admin-only platform overview stats
    @Get('overview')
    @UseGuards(RolesGuard)
    @Roles('admin')
    getOverview() {
        return this.analyticsService.getOverview();
    }

    // Any authenticated user: popular posts
    @Get('posts')
    getPopularPosts(@Query('limit') limit?: string) {
        const parsedLimit = limit !== undefined ? parseInt(limit, 10) : 5;
        if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
            throw new BadRequestException('limit must be a positive integer between 1 and 100');
        }
        return this.analyticsService.getPopularPosts(parsedLimit);
    }

    // Any authenticated user: job application counts
    @Get('jobs')
    getJobApplicationCounts() {
        return this.analyticsService.getJobApplicationCounts();
    }

    // Any authenticated user: user registrations over time
    @Get('users')
    getUserRegistrations(@Query('days') days?: string) {
        const parsedDays = days !== undefined ? parseInt(days, 10) : 30;
        if (!Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
            throw new BadRequestException('days must be a positive integer between 1 and 365');
        }
        return this.analyticsService.getUserRegistrations(parsedDays);
    }

    // Admin only: Prometheus service latencies
    @Get('latencies')
    @UseGuards(RolesGuard)
    @Roles('admin')
    getServiceLatencies() {
        return this.analyticsService.getServiceLatencies();
    }
}
