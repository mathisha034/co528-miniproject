import { RolesGuard } from './roles.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';

const mockReflector = { getAllAndOverride: jest.fn() };

describe('RolesGuard', () => {
  let guard: RolesGuard;

  beforeEach(() => {
    guard = new RolesGuard(mockReflector as any);
  });

  const mockContext = (role: string) => ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  });

  it('should allow when no roles required', () => {
    mockReflector.getAllAndOverride.mockReturnValue(null);
    expect(guard.canActivate(mockContext('student') as any)).toBe(true);
  });

  it('should allow when user has required role', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['admin']);
    expect(guard.canActivate(mockContext('admin') as any)).toBe(true);
  });

  it('should throw ForbiddenException when user lacks required role', () => {
    mockReflector.getAllAndOverride.mockReturnValue(['admin']);
    expect(() => guard.canActivate(mockContext('student') as any)).toThrow(
      ForbiddenException,
    );
  });
});
