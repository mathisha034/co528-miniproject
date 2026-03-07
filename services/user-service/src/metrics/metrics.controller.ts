import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { register, collectDefaultMetrics } from 'prom-client';

// Collect default Node.js metrics (CPU, memory, event loop lag, etc.)
collectDefaultMetrics({ prefix: 'user_service_' });

@Controller('metrics')
export class MetricsController {
  @Get()
  async getMetrics(@Res() res: Response) {
    res.setHeader('Content-Type', register.contentType);
    res.end(await register.metrics());
  }
}
