import { HealthController } from './health.controller';

describe('HealthController', () => {
    let controller: HealthController;

    beforeEach(() => {
        controller = new HealthController();
    });

    it('should return status ok with service name', () => {
        const result = controller.check();
        expect(result.status).toBe('ok');
        expect(result.service).toBe('user-service');
        expect(result.timestamp).toBeDefined();
    });
});
