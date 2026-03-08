import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type JobDocument = Job & Document;

export enum JobStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

// G6.1: job type field
export enum JobType {
  INTERNSHIP = 'internship',
  FULL_TIME = 'full-time',
  PART_TIME = 'part-time',
  CONTRACT = 'contract',
}

@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true, type: String, index: true })
  postedBy: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  company: string;

  @Prop({ type: String, enum: JobStatus, default: JobStatus.OPEN, index: true })
  status: JobStatus;

  @Prop({ type: Date, index: true })
  deadline: Date;

  // G6.1: optional job type (internship / full-time / part-time / contract)
  @Prop({ type: String, enum: JobType, index: true })
  type?: JobType;
}

export const JobSchema = SchemaFactory.createForClass(Job);
