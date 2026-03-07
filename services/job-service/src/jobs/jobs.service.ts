import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job, JobDocument, JobStatus } from './schemas/job.schema';
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
    return this.jobModel.create({
      postedBy: new Types.ObjectId(postedBy),
      ...dto,
      deadline: dto.deadline ? new Date(dto.deadline) : undefined,
    });
  }

  async findAll(): Promise<JobDocument[]> {
    return this.jobModel.find().sort({ createdAt: -1 }).exec();
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
    // withRetry simulates reliable persistence (e.g., notification side-effect)
    return withRetry(() =>
      this.appModel.create({
        jobId: new Types.ObjectId(jobId),
        applicantId: new Types.ObjectId(applicantId),
        coverLetter: dto.coverLetter || '',
      }),
    );
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
    return app.save();
  }

  async findApplicationsByJob(jobId: string): Promise<ApplicationDocument[]> {
    return this.appModel.find({ jobId: new Types.ObjectId(jobId) }).exec();
  }
}
