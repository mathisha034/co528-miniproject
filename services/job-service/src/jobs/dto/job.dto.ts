import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { JobStatus, JobType } from '../schemas/job.schema';
import { ApplicationStatus } from '../schemas/application.schema';

export class CreateJobDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsString()
  company: string;

  @IsDateString()
  @IsOptional()
  deadline?: string;

  // G6.1: optional job type
  @IsEnum(JobType)
  @IsOptional()
  type?: JobType;
}

export class UpdateJobStatusDto {
  @IsEnum(JobStatus)
  status: JobStatus;
}

export class CreateApplicationDto {
  @IsString()
  @IsOptional()
  coverLetter?: string;
}

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;
}
