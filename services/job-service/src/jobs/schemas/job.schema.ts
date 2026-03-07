import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type JobDocument = Job & Document;

export enum JobStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

@Schema({ timestamps: true })
export class Job {
  @Prop({ required: true, type: Types.ObjectId })
  postedBy: Types.ObjectId;

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
}

export const JobSchema = SchemaFactory.createForClass(Job);
