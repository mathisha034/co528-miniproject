import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type EventDocument = EventEntity & Document;

export enum EventStatus {
    UPCOMING = 'upcoming',
    LIVE = 'live',
    ENDED = 'ended',
}

@Schema({ timestamps: true })
export class EventEntity {
    @Prop({ required: true, type: Types.ObjectId })
    createdBy: Types.ObjectId;

    @Prop({ required: true })
    title: string;

    @Prop({ required: true })
    description: string;

    @Prop({ type: Date, index: true })
    eventDate: Date;

    @Prop({ default: '' })
    location: string;

    @Prop({ type: String, enum: EventStatus, default: EventStatus.UPCOMING, index: true })
    status: EventStatus;

    @Prop({ type: [{ type: Types.ObjectId }], default: [] })
    rsvps: Types.ObjectId[];
}

export const EventSchema = SchemaFactory.createForClass(EventEntity);
