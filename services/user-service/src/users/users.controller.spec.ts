import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

const mockUsersService = {
    findMe: jest.fn(),
    updateMe: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
};

describe('UsersController', () => {
    let controller: UsersController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [UsersController],
            providers: [{ provide: UsersService, useValue: mockUsersService }],
        })
            .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
            .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
            .compile();
        controller = module.get<UsersController>(UsersController);
        jest.clearAllMocks();
    });

    it('getMe should call findMe with user keycloakId', async () => {
        mockUsersService.findMe.mockResolvedValue({ email: 'a@b.com' });
        const req = { user: { sub: 'kc-123' } };
        await controller.getMe(req);
        expect(mockUsersService.findMe).toHaveBeenCalledWith('kc-123');
    });

    it('updateMe should call updateMe with keycloakId and dto', async () => {
        mockUsersService.updateMe.mockResolvedValue({ name: 'New' });
        const req = { user: { sub: 'kc-123' } };
        await controller.updateMe(req, { name: 'New' });
        expect(mockUsersService.updateMe).toHaveBeenCalledWith('kc-123', { name: 'New' });
    });

    it('findAll should call findAll on service', async () => {
        mockUsersService.findAll.mockResolvedValue([]);
        await controller.findAll();
        expect(mockUsersService.findAll).toHaveBeenCalled();
    });
});
