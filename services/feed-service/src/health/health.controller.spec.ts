import { HealthController } from './health.controller';

describe('HealthController (feed-service)', () => {
  let controller: HealthController;
  beforeEach(() => {
    controller = new HealthController();
  });

  it('should return ok status for feed-service', () => {
    const result = controller.check();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('feed-service');
  });
});
