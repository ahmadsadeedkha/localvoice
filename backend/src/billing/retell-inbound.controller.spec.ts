import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RetellInboundController } from './retell-inbound.controller';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import Retell from 'retell-sdk';
import { WalletService } from './wallet.service';
import { TenantStatus } from '../tenants/tenant.entity';
import { ConfigService } from '@nestjs/config';

it('allows provider inbound webhooks through session guards to signature verification', async () => {
  const reflector = new Reflector();
  const ctx = {
    getClass: () => RetellInboundController,
    getHandler: () =>
      Object.getOwnPropertyDescriptor(
        RetellInboundController.prototype,
        'handle',
      )!.value,
    switchToHttp: () => ({ getRequest: () => ({}) }),
  } as unknown as ExecutionContext;
  await expect(
    new AuthGuard(reflector, {} as any).canActivate(ctx),
  ).resolves.toBe(true);
  expect(new RolesGuard(reflector).canActivate(ctx)).toBe(true);
});

describe('inbound tenant routing', () => {
  beforeEach(() => {
    jest.spyOn(Retell, 'verify').mockResolvedValue(true);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function setup(matches: any[]) {
    const builder: any = {};
    for (const name of ['select', 'where', 'take'])
      builder[name] = jest.fn().mockReturnValue(builder);
    builder.getMany = jest.fn().mockResolvedValue(matches);
    const wallets = {
      getCallGate: jest
        .fn()
        .mockResolvedValue({ allowed: true, maxDurationMs: 120000 }),
    };
    const controller = new RetellInboundController(
      wallets as any,
      { createQueryBuilder: () => builder } as any,
    );
    const invoke = (number: unknown = '+923001234567') =>
      controller.handle({ rawBody: Buffer.from('{}') } as any, 'signed', {
        call_inbound: { agent_id: 'shared-agent', to_number: number },
      });
    return { builder, wallets, invoke };
  }

  it('scopes shared-agent calls by the dialed number, not the agent', async () => {
    const s = setup([
      {
        id: 'tenant-B',
        status: TenantStatus.Active,
        retellAgentId: 'shared-agent',
      },
    ]);
    await expect(s.invoke()).resolves.toMatchObject({
      call_inbound: { metadata: { tenant_id: 'tenant-B' } },
    });
    expect(s.builder.where).toHaveBeenCalledWith(
      expect.stringContaining('p.e164 = :number'),
      { number: '+923001234567' },
    );
    expect(s.wallets.getCallGate).toHaveBeenCalledWith('tenant-B');
  });

  it.each([
    [],
    [{ id: 'A' }, { id: 'B' }],
    [{ id: 'A', status: TenantStatus.Suspended }],
  ])(
    'rejects unknown, ambiguous, or suspended number mappings (%j)',
    async (...rows) => {
      // it.each spreads each row array into arguments.
      const s = setup(rows);
      await expect(s.invoke()).resolves.toEqual({
        call_inbound: { reject: true },
      });
      expect(s.wallets.getCallGate).not.toHaveBeenCalled();
    },
  );

  it('rejects missing dialed numbers without doing an unscoped lookup', async () => {
    const s = setup([]);
    await expect(s.invoke(null)).resolves.toEqual({
      call_inbound: { reject: true },
    });
    expect(s.builder.getMany).not.toHaveBeenCalled();
  });

  it('fails closed when tenant lookup fails', async () => {
    const s = setup([]);
    s.builder.getMany.mockRejectedValue(new Error('DB unavailable'));
    await expect(s.invoke()).resolves.toEqual({
      call_inbound: { reject: true },
    });
  });
});

it('blocks suspended tenants from starting web calls even with a funded wallet', async () => {
  const wallets = new WalletService(
    {
      getRepository: () => ({
        findOne: async () => ({ status: TenantStatus.Suspended }),
      }),
    } as any,
    new ConfigService(),
  );
  await expect(wallets.assertCanStartCall('tenant-1')).rejects.toMatchObject({
    response: expect.objectContaining({ reason: 'tenant_suspended' }),
  });
});
