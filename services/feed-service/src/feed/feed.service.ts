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
  ) { }

  async create(userId: string, role: string, dto: CreatePostDto): Promise<PostDocument> {
    const post = await this.postModel.create({
      userId: userId,
      authorRole: role || 'student',
      content: dto.content,
      imageUrl: dto.imageUrl || '',
    });
    // Invalidate feed cache on new post
    const keys = await this.redis.keys('feed:page:*');
    await Promise.all(keys.map((k) => this.redis.del(k)));
    return post;
  }

  // G9.1: Single-post retrieval
  async findById(id: string): Promise<PostDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Post not found');
    const post = await this.postModel.findById(id).exec();
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  async getFeed(page: number, limit: number, role?: string): Promise<{ items: PostDocument[], meta: { totalPages: number, page: number } }> {
    const cacheKey = `feed:page:${page}:limit:${limit}:role:${role || 'all'}`;

    // Try cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // DB query
    const skip = (page - 1) * limit;
    const filter: Record<string, any> = {};
    if (role) {
      filter.authorRole = role;
    }

    const [items, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.postModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;
    const result = { items, meta: { totalPages, page } };

    // Store in cache
    await this.redis.set(cacheKey, JSON.stringify(result), FEED_CACHE_TTL);
    return result;
  }

  async likePost(postId: string, userId: string, authHeader?: string): Promise<PostDocument> {
    const userObjId = userId;
    const post = await this.postModel.findByIdAndUpdate(
      postId,
      { $addToSet: { likes: userObjId } },
      { new: true },
    );
    if (!post) throw new NotFoundException('Post not found');
    await this.redis
      .keys('feed:page:*')
      .then((keys) => Promise.all(keys.map((k) => this.redis.del(k))));

    if (userId !== post.userId?.toString()) {
      const internalToken = process.env.INTERNAL_TOKEN || 'miniproject-internal-auth-token';
      fetch('http://notification-service.miniproject.svc.cluster.local:3006/api/v1/internal/notifications/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
        },
        body: JSON.stringify({
          userId: post.userId.toString(),
          type: 'post_liked',
          message: `User ${userId} liked your post`,
          idempotencyKey: `post_liked:${postId}:${userId}`,
        }),
      }).then(res => {
        console.log(`[DEBUG] HTTP Internal Notification responded with status: ${res.status}`);
      }).catch(err => console.error('[DEBUG] Failed to send internal notification:', err));
    }

    return post;
  }

  async unlikePost(postId: string, userId: string): Promise<PostDocument> {
    const userObjId = userId;
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

  // G2.1: Verify a MinIO object exists by its path within the bucket
  async verifyImage(objectPath: string): Promise<{ exists: boolean; size: number; contentType: string }> {
    return this.minio.statObject(objectPath);
  }
}
