import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { MemberRole } from '../tenants/tenant-member.entity';
import { Principal } from './auth.types';

const principal = (over: Partial<Principal> = {}): Principal => ({
  userId: 'user_1',
  orgId: 'org_1',
  tenantId: 't1',
  role: MemberRole.Staff,
  isPlatformAdmin: false,
  ...over,
});

const run = (p: Principal, meta: Record<string, unknown>) => {
  const reflector = {
    getAllAndOverride: (key: string) => meta[key],
  } as unknown as Reflector;
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ principal: p }) }),
  } as unknown as ExecutionContext;
  return new RolesGuard(reflector).canActivate(ctx);
};

describe('RolesGuard', () => {
  it('allows a listed role', () => {
    expect(
      run(principal({ role: MemberRole.Admin }), {
        roles: [MemberRole.Admin, MemberRole.Owner],
      }),
    ).toBe(true);
  });
  it('rejects an unlisted role', () => {
    expect(() => run(principal(), { roles: [MemberRole.Admin] })).toThrow(
      ForbiddenException,
    );
  });
  it('rejects a role route when there is no tenant', () => {
    expect(() =>
      run(principal({ tenantId: null, role: null }), {
        roles: [MemberRole.Staff],
      }),
    ).toThrow(ForbiddenException);
  });
  it('rejects platform-only routes for normal users', () => {
    expect(() => run(principal(), { platformAdminOnly: true })).toThrow(
      ForbiddenException,
    );
  });
  it('allows platform admins on platform-only routes', () => {
    expect(
      run(principal({ isPlatformAdmin: true }), { platformAdminOnly: true }),
    ).toBe(true);
  });
});
