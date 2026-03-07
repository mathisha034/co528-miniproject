import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health/health.controller';
import { MetricsController } from './metrics/metrics.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(
      process.env.MONGO_URI || 'mongodb://localhost:27017/miniproject_db',
      {
        connectionFactory: (connection) => {
          connection.on('connected', () =>
            console.log('[user-service] MongoDB connected'),
          );
          connection.on('error', (err: Error) =>
            console.error('[user-service] MongoDB error:', err),
          );
          return connection;
        },
      },
    ),
    // Rate limiting: 10 req/s per IP (100 requests per 10s window), burst handled by limit
    ThrottlerModule.forRoot([{ ttl: 10000, limit: 100 }]),
    AuthModule,
    UsersModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
