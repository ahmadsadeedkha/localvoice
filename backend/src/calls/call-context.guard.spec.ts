import { ExecutionContext } from '@nestjs/common';
import Retell from 'retell-sdk';
import { CallContextGuard } from './call-context.guard';
import { TenantStatus } from '../tenants/tenant.entity';

describe('tool call tenant suspension', () => {
  const oldKey = process.env.RETELL_API_KEY;
  beforeEach(() => {
    process.env.RETELL_API_KEY = 'test-key';
    jest.spyOn(Retell, 'verify').mockResolvedValue(true);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    if (oldKey === undefined) delete process.env.RETELL_API_KEY;
    else process.env.RETELL_API_KEY = oldKey;
  });

  it('checks suspension again on an already running call', async () => {
    const tenant = { status: TenantStatus.Active };
    const calls = {
      findByRetellCallId: async () => ({
        status: 'in_progress',
        id: 'call-1',
        tenantId: 'tenant-1',
        retellCallId: 'retell-1',
      }),
    };
    const tenants = {
      findById: jest.fn().mockImplementation(async () => tenant),
    };
    const request = {
      headers: { 'x-retell-signature': 'signed' },
      rawBody: Buffer.from(JSON.stringify({ call: { call_id: 'retell-1' } })),
    };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const guard = new CallContextGuard(calls as any, tenants as any);
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    tenant.status = TenantStatus.Suspended;
    await expect(guard.canActivate(ctx)).rejects.toThrow('Tenant unavailable');
    expect(tenants.findById).toHaveBeenCalledWith('tenant-1');
  });
});
