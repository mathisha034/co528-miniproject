import {
    Controller, Get, Post, Patch,
    Param, Body, UseGuards, Request,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { CreateJobDto, UpdateJobStatusDto, CreateApplicationDto, UpdateApplicationStatusDto } from './dto/job.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('jobs')
@UseGuards(JwtAuthGuard)
export class JobsController {
    constructor(private readonly jobsService: JobsService) { }

    // Alumni/Admin: create job
    @Post()
    @UseGuards(RolesGuard)
    @Roles('alumni', 'admin')
    create(@Request() req, @Body() dto: CreateJobDto) {
        return this.jobsService.create(req.user.sub, dto);
    }

    // Any authenticated user: list jobs
    @Get()
    findAll() {
        return this.jobsService.findAll();
    }

    // Any authenticated user: job detail
    @Get(':id')
    findById(@Param('id') id: string) {
        return this.jobsService.findById(id);
    }

    // Alumni/Admin: update job status (open → closed)
    @Patch(':id/status')
    @UseGuards(RolesGuard)
    @Roles('alumni', 'admin')
    updateStatus(@Param('id') id: string, @Body() dto: UpdateJobStatusDto) {
        return this.jobsService.updateStatus(id, dto);
    }

    // Student: apply for a job
    @Post(':id/apply')
    @UseGuards(RolesGuard)
    @Roles('student')
    apply(@Param('id') id: string, @Request() req, @Body() dto: CreateApplicationDto) {
        return this.jobsService.apply(id, req.user.sub, dto);
    }

    // Alumni/Admin: update application status
    @Patch(':id/applications/:appId')
    @UseGuards(RolesGuard)
    @Roles('alumni', 'admin')
    updateApplicationStatus(
        @Param('id') id: string,
        @Param('appId') appId: string,
        @Body() dto: UpdateApplicationStatusDto,
    ) {
        return this.jobsService.updateApplicationStatus(id, appId, dto);
    }

    // Alumni/Admin: list applications for a job
    @Get(':id/applications')
    @UseGuards(RolesGuard)
    @Roles('alumni', 'admin')
    findApplications(@Param('id') id: string) {
        return this.jobsService.findApplicationsByJob(id);
    }
}
