import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private available = false;

  onModuleInit() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      // Fail commands immediately when Redis is unreachable (no blocking queue)
      maxRetriesPerRequest: 0,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    this.client.on('connect', () => {
      this.available = true;
      this.logger.log('[feed-service] Redis connected');
    });
    this.client.on('error', (err) => {
      this.available = false;
      this.logger.warn(`[feed-service] Redis unavailable — falling back to MongoDB: ${err.message}`);
    });
    this.client.on('close', () => {
      this.available = false;
    });
    this.client.on('ready', () => {
      this.available = true;
    });
  }

  /** Returns cached string or null when Redis is unavailable (cache miss fallback). */
  async get(key: string): Promise<string | null> {
    if (!this.available) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  /** Stores value; silently skips when Redis is unavailable. */
  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (!this.available) return;
    try {
      await this.client.setex(key, ttlSeconds, value);
    } catch {
      // non-fatal — cache write miss
    }
  }

  /** Deletes key; silently skips when Redis is unavailable. */
  async del(key: string): Promise<void> {
    if (!this.available) return;
    try {
      await this.client.del(key);
    } catch {
      // non-fatal
    }
  }

  /** Returns matching keys or empty array when Redis is unavailable. */
  async keys(pattern: string): Promise<string[]> {
    if (!this.available) return [];
    try {
      return await this.client.keys(pattern);
    } catch {
      return [];
    }
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}

