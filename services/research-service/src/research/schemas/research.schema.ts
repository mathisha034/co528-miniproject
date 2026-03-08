import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export enum ResearchStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    ARCHIVED = 'archived',
}

@Schema({ _id: false })
export class ResearchDocument {
    @Prop({ required: true }) name: string;
    @Prop({ required: true }) minioKey: string;
    @Prop({ default: Date.now }) uploadedAt: Date;
    @Prop({ type: Number, default: 0 }) size: number;  // G5.1: file size in bytes after successful MinIO upload
}

@Schema({ timestamps: true })
export class Research {
    @Prop({ required: true }) title: string;
    @Prop({ default: '' }) description: string;
    @Prop({ required: true }) ownerId: string;
    @Prop({ type: [String], default: [] }) collaborators: string[];
    @Prop({
        type: String,
        enum: ResearchStatus,
        default: ResearchStatus.ACTIVE,
    })
    status: ResearchStatus;
    @Prop({ type: [{ name: String, minioKey: String, uploadedAt: Date, size: Number }], default: [] })
    documents: ResearchDocument[];
    @Prop({ type: [String], default: [] }) tags: string[];
}

export type ResearchMongo = Research & Document;
export const ResearchSchema = SchemaFactory.createForClass(Research);

// Indexes
ResearchSchema.index({ ownerId: 1 });
ResearchSchema.index({ status: 1 });
ResearchSchema.index({ collaborators: 1 });
