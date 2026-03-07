import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { CreatePostDto } from './dto/post.dto';
import { RedisService } from '../redis/redis.service';
import { MinioService } from '../minio/minio.service';

const FEED_CACHE_TTL = 60; // seconds

@Injectable()
export class FeedService {
  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    private readonly redis: RedisService,
    private readonly minio: MinioService,
  ) {}

  async create(userId: string, dto: CreatePostDto): Promise<PostDocument> {
    const post = await this.postModel.create({
      userId: new Types.ObjectId(userId),
      content: dto.content,
      imageUrl: dto.imageUrl || '',
    });
    // Invalidate feed cache on new post
    const keys = await this.redis.keys('feed:page:*');
    await Promise.all(keys.map((k) => this.redis.del(k)));
    return post;
  }

  async getFeed(page: number, limit: number): Promise<PostDocument[]> {
    const cacheKey = `feed:page:${page}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // DB query
    const skip = (page - 1) * limit;
    const posts = await this.postModel
      .find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    // Store in cache
    await this.redis.set(cacheKey, JSON.stringify(posts), FEED_CACHE_TTL);
    return posts;
  }

  async likePost(postId: string, userId: string): Promise<PostDocument> {
    const userObjId = new Types.ObjectId(userId);
    const post = await this.postModel.findByIdAndUpdate(
      postId,
      { $addToSet: { likes: userObjId } },
      { new: true },
    );
    if (!post) throw new NotFoundException('Post not found');
    await this.redis
      .keys('feed:page:*')
      .then((keys) => Promise.all(keys.map((k) => this.redis.del(k))));
    return post;
  }

  async unlikePost(postId: string, userId: string): Promise<PostDocument> {
    const userObjId = new Types.ObjectId(userId);
    const post = await this.postModel.findByIdAndUpdate(
      postId,
      { $pull: { likes: userObjId } },
      { new: true },
    );
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async uploadImage(buffer: Buffer, mimetype: string): Promise<string> {
    return this.minio.uploadFile(buffer, mimetype);
  }
}
