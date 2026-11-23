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
    ESTIMATED_COST_PER_MINUTE: 2.5,
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

it('adds the current margin to the per-minute estimate when checking affordability', async () => {
  const wallet = { balanceCredits: 7.5, creditLimit: 0, blockedReason: null };
  const ds = {
    getRepository: (entity: unknown) => ({
      findOne: async () =>
        entity === Tenant ? { status: TenantStatus.Active } : wallet,
    }),
  };
  const config = new ConfigService({
    ESTIMATED_COST_PER_MINUTE: 2.5,
    MIN_CALL_MINUTES: 2,
    MAX_CALL_MINUTES: 3,
  });
  const pricing = { getMarginPerMinute: async () => 0.5 };
  const service = new WalletService(ds as any, config, pricing as any);
  // 7.5 / (2.5 + 0.5) = 2.5 minutes -> 2 whole minutes
  await expect(service.getCallGate('tenant-1')).resolves.toEqual({
    allowed: true,
    maxDurationMs: 120000,
  });
  wallet.balanceCredits = 5.9;
  await expect(service.getCallGate('tenant-1')).resolves.toEqual({
    allowed: false,
    reason: 'no_balance',
  });
});