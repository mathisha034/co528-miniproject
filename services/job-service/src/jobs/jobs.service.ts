import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument, JobStatus, JobType } from './schemas/job.schema';
import {
  Application,
  ApplicationDocument,
  ApplicationStatus,
} from './schemas/application.schema';
import {
  CreateJobDto,
  UpdateJobStatusDto,
  CreateApplicationDto,
  UpdateApplicationStatusDto,
} from './dto/job.dto';
import { withRetry } from '../common/retry.util';

// Valid status transitions for jobs
const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.OPEN]: [JobStatus.CLOSED],
  [JobStatus.CLOSED]: [], // terminal state
};

// Valid status transitions for applications
const APP_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.PENDING]: [ApplicationStatus.REVIEWED],
  [ApplicationStatus.REVIEWED]: [
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.ACCEPTED]: [],
  [ApplicationStatus.REJECTED]: [],
};

@Injectable()
export class JobsService {
  constructor(
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    @InjectModel(Application.name) private appModel: Model<ApplicationDocument>,
  ) {}

  async create(postedBy: string, dto: CreateJobDto): Promise<JobDocument> {
    const job = await this.jobModel.create({
      postedBy,
      ...dto,
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
    });

    // G6.2: Fire-and-forget general notification to job poster confirming publication
    const internalToken =
      process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
    fetch(
      'http://notification-service.miniproject.svc.cluster.local:3006/api/v1/internal/notifications/notify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
        },
        body: JSON.stringify({
          userId: postedBy,
          type: 'general',
          message: `Your job posting "${job.title}" at ${job.company} has been published`,
          idempotencyKey: `job_posted:${job._id}:${postedBy}`,
        }),
      },
    ).catch((err) =>
      console.error(
        '[job-service] Failed to dispatch job_posted notification:',
        err,
      ),
    );

    return job;
  }

  // G6.3: Default to open jobs only; pass status='all' to include closed jobs
  // G6.1: Optional ?type= filter
  async findAll(type?: string, status?: string): Promise<JobDocument[]> {
    const filter: Record<string, unknown> = {};
    // Default: only open jobs; pass status=all or status=closed to override
    if (!status || status === 'open') {
      filter.status = JobStatus.OPEN;
    } else if (status !== 'all') {
      filter.status = status;
    }
    if (type) {
      filter.type = type;
    }
    return this.jobModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<JobDocument> {
    const job = await this.jobModel.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  async updateStatus(
    id: string,
    dto: UpdateJobStatusDto,
  ): Promise<JobDocument> {
    const job = await this.findById(id);
    const allowed = JOB_TRANSITIONS[job.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid transition: ${job.status} → ${dto.status}. Allowed: [${allowed.join(', ') || 'none'}]`,
      );
    }
    job.status = dto.status;
    return job.save();
  }

  async apply(
    jobId: string,
    applicantId: string,
    dto: CreateApplicationDto,
  ): Promise<ApplicationDocument> {
    const job = await this.findById(jobId);
    if (job.status === JobStatus.CLOSED) {
      throw new BadRequestException('Cannot apply to a closed job');
    }
    let application: ApplicationDocument;
    try {
      application = await withRetry(() =>
        this.appModel.create({
          jobId: new Types.ObjectId(jobId),
          applicantId,
          coverLetter: dto.coverLetter || '',
        }),
      );
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException('You have already applied to this job');
      }
      throw err;
    }

    // G3.1: Fire-and-forget notification to applicant
    const internalToken =
      process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
    fetch(
      'http://notification-service.miniproject.svc.cluster.local:3006/api/v1/internal/notifications/notify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
        },
        body: JSON.stringify({
          userId: applicantId,
          type: 'job_applied',
          message: `Your application for "${job.title}" at ${job.company} has been submitted successfully`,
          idempotencyKey: `job_applied:${jobId}:${applicantId}`,
        }),
      },
    ).catch((err) =>
      console.error(
        '[job-service] Failed to dispatch job_applied notification:',
        err,
      ),
    );

    return application;
  }

  async updateApplicationStatus(
    jobId: string,
    appId: string,
    dto: UpdateApplicationStatusDto,
  ): Promise<ApplicationDocument> {
    const app = await this.appModel.findOne({
      _id: appId,
      jobId: new Types.ObjectId(jobId),
    });
    if (!app) throw new NotFoundException('Application not found');
    const allowed = APP_TRANSITIONS[app.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Invalid transition: ${app.status} → ${dto.status}. Allowed: [${allowed.join(', ') || 'none'}]`,
      );
    }
    app.status = dto.status;
    const saved = await app.save();

    // G3.2: Fire-and-forget notification to applicant
    const internalToken =
      process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
    fetch(
      'http://notification-service.miniproject.svc.cluster.local:3006/api/v1/internal/notifications/notify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
        },
        body: JSON.stringify({
          userId: app.applicantId,
          type: 'job_status_changed',
          message: `Your application status has been updated to "${dto.status}"`,
          idempotencyKey: `job_status_changed:${appId}:${dto.status}`,
        }),
      },
    ).catch((err) =>
      console.error(
        '[job-service] Failed to dispatch job_status_changed notification:',
        err,
      ),
    );

    return saved;
  }

  async findApplicationsByJob(jobId: string): Promise<ApplicationDocument[]> {
    return this.appModel.find({ jobId: new Types.ObjectId(jobId) }).exec();
  }
}
