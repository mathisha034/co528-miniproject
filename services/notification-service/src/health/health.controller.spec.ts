import { HealthController } from './health.controller';

describe('HealthController (notification-service)', () => {
    let controller: HealthController;
    beforeEach(() => { controller = new HealthController(); });

    it('should return ok with service name', () => {
        const result = controller.check();
        expect(result.status).toBe('ok');
        expect(result.service).toBe('notification-service');
        expect(result.timestamp).toBeDefined();
    });
});
