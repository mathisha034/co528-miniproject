import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  async check() {
    // Simulate network delay for K8s resilience testing
    await new Promise(resolve => setTimeout(resolve, 3000));
    return {
      status: 'ok',
      service: 'notification-service',
      timestamp: new Date().toISOString(),
    };
  }
}
