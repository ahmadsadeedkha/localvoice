import { ConfigService } from '@nestjs/config';
import { WalletService } from './wallet.service';
import { Tenant, TenantStatus } from '../tenants/tenant.entity';

it('uses validated numeric configuration to cap call duration and enforce minimum balance', async () => {
  const wallet = { balanceCredits: 10, creditLimit: 0, blockedReason: null };
  const ds = {
    getRepository: (entity: unknown) => ({
      findOne: async () =>
        entity === Tenant ? { status: TenantStatus.Active } : wallet,
    }),
  };
  const config = new ConfigService({
    CREDITS_PER_MINUTE: 2.5,
    MIN_CALL_MINUTES: 2,
    MAX_CALL_MINUTES: 3,
  });
  const service = new WalletService(ds as any, config);
  await expect(service.getCallGate('tenant-1')).resolves.toEqual({
    allowed: true,
    maxDurationMs: 180000,
  });
  wallet.balanceCredits = 4;
  await expect(service.getCallGate('tenant-1')).resolves.toEqual({
    allowed: false,
    reason: 'no_balance',
  });
});
