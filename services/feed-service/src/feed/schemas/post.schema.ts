import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PostDocument = Post & Document;

@Schema({ timestamps: true })
export class Post {
    @Prop({ required: true, type: Types.ObjectId, index: true })
    userId: Types.ObjectId;

    @Prop({ required: true, minlength: 1 })
    content: string;

    @Prop({ default: '' })
    imageUrl: string;

    @Prop({ type: [{ type: Types.ObjectId }], default: [] })
    likes: Types.ObjectId[];

    @Prop({ default: 0 })
    commentCount: number;
}

export const PostSchema = SchemaFactory.createForClass(Post);

// Compound index for paginated feed
PostSchema.index({ userId: 1, createdAt: -1 });
PostSchema.index({ createdAt: -1 });
