import { Injectable, Logger } from '@nestjs/common';
import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client;
  private readonly bucket = process.env.MINIO_BUCKET_NAME || 'miniproject';

  constructor() {
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'rootuser',
      secretKey: process.env.MINIO_SECRET_KEY || 'rootpassword123',
    });
  }

  async ensureBucketExists(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket, 'us-east-1');
      this.logger.log(`Bucket '${this.bucket}' created`);
    }
  }

  async uploadFile(buffer: Buffer, mimetype: string): Promise<string> {
    await this.ensureBucketExists();
    const ext = mimetype.split('/')[1] || 'bin';
    const objectName = `posts/${uuidv4()}.${ext}`;
    await this.client.putObject(
      this.bucket,
      objectName,
      buffer,
      buffer.length,
      {
        'Content-Type': mimetype,
      },
    );
    return `http://${process.env.MINIO_ENDPOINT || 'localhost'}:${process.env.MINIO_PORT || '9000'}/${this.bucket}/${objectName}`;
  }
}
