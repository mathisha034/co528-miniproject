import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { NotificationsModule } from './notifications/notifications.module';
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
            console.log('[notification-service] MongoDB connected'),
          );
          connection.on('error', (err: Error) =>
            console.error('[notification-service] MongoDB error:', err),
          );
          return connection;
        },
      },
    ),
    ThrottlerModule.forRoot([{ ttl: 10000, limit: 100 }]),
    EventEmitterModule.forRoot({ wildcard: false, delimiter: '.' }),
    AuthModule,
    NotificationsModule,
  ],
  controllers: [HealthController, MetricsController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule { }
