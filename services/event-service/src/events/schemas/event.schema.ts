import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EventDocument = EventEntity & Document;

export enum EventStatus {
  UPCOMING = 'upcoming',
  LIVE = 'live',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
}

@Schema({ timestamps: true })
export class EventEntity {
  @Prop({ required: true, type: String, index: true })
  createdBy: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: Date, index: true })
  eventDate: Date;

  @Prop({ default: '' })
  location: string;

  @Prop({
    type: String,
    enum: EventStatus,
    default: EventStatus.UPCOMING,
    index: true,
  })
  status: EventStatus;

  @Prop({ type: [String], default: [] })
  rsvps: string[];
}

export const EventSchema = SchemaFactory.createForClass(EventEntity);
