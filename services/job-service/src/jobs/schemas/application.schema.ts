import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ApplicationDocument = Application & Document;

export enum ApplicationStatus {
  PENDING = 'pending',
  REVIEWED = 'reviewed',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

@Schema({ timestamps: true })
export class Application {
  @Prop({ required: true, type: Types.ObjectId, index: true })
  jobId: Types.ObjectId;

  @Prop({ required: true, type: String, index: true })
  applicantId: string;

  @Prop({
    type: String,
    enum: ApplicationStatus,
    default: ApplicationStatus.PENDING,
    index: true,
  })
  status: ApplicationStatus;

  @Prop({ default: '' })
  coverLetter: string;
}

export const ApplicationSchema = SchemaFactory.createForClass(Application);

// Ensure a user can only apply to a specific job once
ApplicationSchema.index({ jobId: 1, applicantId: 1 }, { unique: true });
