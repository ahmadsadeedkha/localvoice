import {
  InvoicesService,
  monthStartUtc,
  toInvoiceDto,
} from './invoices.service';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { WalletService } from './wallet.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function setup() {
  let state: any = {
    invoice: {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      status: InvoiceStatus.Open,
      creditsUsed: 10,
      pricePerCredit: 1,
      currency: 'USD',
      amount: 10,
      issuedAt: new Date('2025-01-01T00:00:00Z'),
    },
    wallet: {
      billingMode: 'postpaid',
      tenantId: 'tenant-1',
      invoiceDueDays: 7,
      balanceCredits: -10,
      creditLimit: 100,
      blockedReason: null,
      lowBalanceThreshold: -80,
    },
    ledger: [],
  };
  let failInvoiceSave = false;
  const m = {
    query: async () => [{ exists: true }],
    findOne: jest
      .fn()
      .mockImplementation(async (entity) =>
        structuredClone(entity === Invoice ? state.invoice : state.wallet),
      ),
    findOneOrFail: async () => structuredClone(state.wallet),
    exists: async (_entity: unknown, opts: any) =>
      state.ledger.some(
        (e: any) =>
          e.type === opts.where.type && e.paymentRef === opts.where.paymentRef,
      ),
    insert: async (_entity: unknown, value: any) => {
      state.ledger.push(structuredClone(value));
    },
    count: async () => 0,
    save: async (value: any) => {
      if ('creditsUsed' in value) {
        if (failInvoiceSave) throw new Error('Invoice save failed');
        state.invoice = structuredClone(value);
      } else state.wallet = structuredClone(value);
      return value;
    },
  };
  let tail = Promise.resolve();
  const billingSettings: any = {
    billingMode: 'postpaid',
    pricePerCredit: 1,
    currency: 'USD',
    invoiceDueDays: 7,
  };
  const ds = {
    transaction: (fn: any) => {
      const result = tail.then(async () => {
        const before = structuredClone(state);
        try {
          return await fn(m);
        } catch (e) {
          state = before;
          throw e;
        }
      });
      tail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    getRepository: () => ({
      findOne: async () => billingSettings,
      find: async () =>
        state.wallet.blockedReason === 'invoice_unpaid' ? [state.wallet] : [],
    }),
    query: jest.fn().mockResolvedValue([{ used: '10' }]),
  };
  let generated: any = null;
  const repo = {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    findOne: async () => generated,
    create: (p: any) => p,
    save: async (p: any) => (generated = p),
  };
  const wallets = new WalletService(ds as any, new ConfigService());
  const notifications = { add: jest.fn() };
  const service = new InvoicesService(
    ds as any,
    wallets,
    repo as any,
    notifications as any,
  );
  return {
    service,
    wallets,
    billingSettings,
    repo,
    notifications,
    m,
    ds,
    state: () => state,
    failSave: () => {
      failInvoiceSave = true;
    },
  };
}

describe('atomic invoice transitions', () => {
  it('rejects payment after a concurrent void without crediting the wallet', async () => {
    const s = setup();
    const results = await Promise.allSettled([
      s.service.voidInvoice('invoice-1'),
      s.service.markPaid('invoice-1', 'admin'),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(s.state().invoice.status).toBe(InvoiceStatus.Void);
    expect(s.state().wallet.balanceCredits).toBe(-10);
    expect(s.state().ledger).toHaveLength(0);
  });

  it('rejects void after payment wins the lock', async () => {
    const s = setup();
    const results = await Promise.allSettled([
      s.service.markPaid('invoice-1', 'admin'),
      s.service.voidInvoice('invoice-1'),
    ]);
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(s.state().invoice.status).toBe(InvoiceStatus.Paid);
    expect(s.state().wallet.balanceCredits).toBe(0);
    expect(s.state().ledger).toHaveLength(1);
    expect(s.m.findOne).toHaveBeenCalledWith(
      Invoice,
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  it('credits only once when payment requests are duplicated', async () => {
    const s = setup();
    await Promise.all([
      s.service.markPaid('invoice-1', 'admin'),
      s.service.markPaid('invoice-1', 'admin'),
    ]);
    expect(s.state().wallet.balanceCredits).toBe(0);
    expect(s.state().ledger).toHaveLength(1);
  });

  it('rolls back ledger and wallet changes if saving invoice status fails', async () => {
    const s = setup();
    s.failSave();
    await expect(s.service.markPaid('invoice-1', 'admin')).rejects.toThrow(
      'Invoice save failed',
    );
    expect(s.state().invoice.status).toBe(InvoiceStatus.Open);
    expect(s.state().wallet.balanceCredits).toBe(-10);
    expect(s.state().ledger).toHaveLength(0);
  });

  it('does not allow repricing to reopen a paid invoice', async () => {
    const s = setup();
    await s.service.markPaid('invoice-1', 'admin');
    await expect(s.service.setPrice('invoice-1', 2, 'USD')).rejects.toThrow(
      'Only open invoices',
    );
    expect(s.state().invoice.status).toBe(InvoiceStatus.Paid);
  });
});

describe('invoice periods', () => {
  it('refuses to issue an unpriced invoice', async () => {
    const s = setup();
    s.billingSettings.pricePerCredit = null;
    const now = new Date();
    await expect(
      s.service.generateForTenant(
        'tenant-1',
        monthStartUtc(now.getUTCFullYear(), now.getUTCMonth()),
      ),
    ).rejects.toThrow('Set a positive price and currency');
  });
  it('rejects current and future months before storing a final invoice', async () => {
    const s = setup();
    const now = new Date();
    for (const month of [now.getUTCMonth() + 1, now.getUTCMonth() + 2]) {
      await expect(
        s.service.generateForTenant(
          'tenant-1',
          monthStartUtc(now.getUTCFullYear(), month),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(s.ds.query).not.toHaveBeenCalled();
  });

  it('generates completed months idempotently', async () => {
    const s = setup();
    const now = new Date();
    const period = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth());
    await expect(
      s.service.generateForTenant('tenant-1', period),
    ).resolves.toMatchObject({ created: true, invoice: { creditsUsed: 10 } });
    await expect(
      s.service.generateForTenant('tenant-1', period),
    ).resolves.toMatchObject({ created: false });
  });
});

describe('legacy unpriced invoices and credit policy', () => {
  it('sends the one-day reminder directly for short payment terms', async () => {
    const s = setup();
    const invoice = s.state().invoice;
    Object.assign(invoice, {
      dueAt: new Date(Date.now() + 12 * 3600000),
      reminder1dSentAt: null,
      reminder3dSentAt: null,
    });
    s.repo.find.mockResolvedValueOnce([invoice]);
    await s.service.runDailyChecks();
    expect(s.notifications.add).toHaveBeenCalledWith(
      'invoice-reminder',
      expect.objectContaining({ daysLeft: 1 }),
    );
    expect(invoice.reminder1dSentAt).toBeInstanceOf(Date);
    expect(invoice.reminder3dSentAt).toBeInstanceOf(Date);
  });
  it('does not accept payment against an invoice without an amount', async () => {
    const s = setup();
    s.state().invoice.amount = null;
    await expect(s.service.markPaid('invoice-1', 'admin')).rejects.toThrow(
      'Price this invoice',
    );
    expect(s.state().ledger).toHaveLength(0);
  });

  it('shows an unpriced invoice as needing pricing, not overdue', () => {
    expect(
      toInvoiceDto({
        amount: null,
        pricePerCredit: null,
        currency: null,
        status: InvoiceStatus.Open,
        dueAt: new Date(0),
      } as any),
    ).toMatchObject({ needsPricing: true, overdue: false });
  });

  it('starts a fresh payment window after a legacy invoice is priced', async () => {
    const s = setup();
    Object.assign(s.state().invoice, {
      amount: null,
      pricePerCredit: null,
      dueAt: new Date(0),
    });
    const before = Date.now();
    const invoice = await s.service.setPrice('invoice-1', 2, 'USD');
    expect(invoice.amount).toBe(20);
    expect(invoice.dueAt.getTime()).toBeGreaterThanOrEqual(
      before + 7 * 86400000,
    );
    expect(invoice.reminder1dSentAt).toBeNull();
    expect(invoice.issuedAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(s.notifications.add).toHaveBeenCalledWith(
      'invoice-issued',
      expect.objectContaining({ invoiceId: 'invoice-1', dueAt: invoice.dueAt }),
      expect.anything(),
    );
  });

  it('clears stale invoice holds when no priced overdue invoice remains', async () => {
    const s = setup();
    s.state().wallet.blockedReason = 'invoice_unpaid';
    await s.service.runDailyChecks();
    expect(s.state().wallet.blockedReason).toBeNull();
    expect(s.repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          amount: expect.anything(),
          pricePerCredit: expect.anything(),
          currency: expect.anything(),
        }),
      }),
    );
  });

  it('preserves a promotional grant when the full invoice is paid', async () => {
    const s = setup();
    await s.wallets.topUp({
      tenantId: 'tenant-1',
      credits: 3,
      type: 'grant',
      note: 'Promotion',
    });
    await s.service.markPaid('invoice-1', 'admin');
    expect(s.state().wallet.balanceCredits).toBe(3);
    expect(s.state().ledger.map((e: any) => e.type)).toEqual([
      'grant',
      'purchase',
    ]);
  });
});

describe('invoice generation recovery', () => {
  const now = new Date();
  const period = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth());
  it('retries a pending issuance notice even when the invoice was created by the previous attempt', async () => {
    const s = setup();
    s.ds.query.mockResolvedValueOnce([{ tenant_id: 'tenant-1' }]);
    s.notifications.add.mockRejectedValueOnce(new Error('Queue unavailable'));
    await expect(s.service.generateForPeriod(period)).rejects.toThrow(
      '1 tenant(s) failed',
    );
    s.ds.query.mockResolvedValueOnce([{ tenant_id: 'tenant-1' }]);
    await expect(s.service.generateForPeriod(period)).resolves.toMatchObject({
      created: 0,
    });
    expect(s.notifications.add).toHaveBeenCalledTimes(2);
  });
  it('skips usage that rounds to zero without inserting an invoice or failing the batch', async () => {
    const s = setup();
    s.billingSettings.pricePerCredit = 0.001;
    s.ds.query
      .mockResolvedValueOnce([{ tenant_id: 'tenant-1' }])
      .mockResolvedValueOnce([{ used: '1' }]);
    await expect(s.service.generateForPeriod(period)).resolves.toMatchObject({
      created: 0,
      needsPricing: 0,
    });
    s.billingSettings.pricePerCredit = 1;
    await expect(
      s.service.generateForTenant('tenant-1', period),
    ).resolves.toMatchObject({ created: true });
  });
  it('queues an admin notice and completes normally when pricing is missing', async () => {
    const s = setup();
    s.billingSettings.pricePerCredit = null;
    s.ds.query.mockResolvedValueOnce([{ tenant_id: 'tenant-1' }]);
    await expect(s.service.generateForPeriod(period)).resolves.toMatchObject({
      created: 0,
      needsPricing: 1,
    });
    expect(s.notifications.add).toHaveBeenCalledWith(
      'invoice-needs-pricing',
      expect.objectContaining({ tenantIds: ['tenant-1'] }),
      expect.anything(),
    );
  });
  it('still fails for database errors', async () => {
    const s = setup();
    s.ds.query
      .mockResolvedValueOnce([{ tenant_id: 'tenant-1' }])
      .mockRejectedValueOnce(new Error('Database down'));
    await expect(s.service.generateForPeriod(period)).rejects.toThrow(
      '1 tenant(s) failed',
    );
  });
  it('keeps notice intent after a post-commit queue outage and retries it without resetting dates', async () => {
    const s = setup();
    Object.assign(s.state().invoice, { amount: null, pricePerCredit: null });
    s.notifications.add.mockRejectedValueOnce(new Error('Redis down'));
    await expect(s.service.setPrice('invoice-1', 2, 'USD')).rejects.toThrow(
      'Redis down',
    );
    expect(s.state().invoice.issueNoticePending).toBe(true);
    const dueAt = s.state().invoice.dueAt;
    await s.service.setPrice('invoice-1', 2, 'USD');
    expect(s.state().invoice.dueAt).toEqual(dueAt);
    expect(s.notifications.add).toHaveBeenCalledTimes(2);
    expect(s.repo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'invoice-1', dueAt }),
      { issueNoticePending: false },
    );
  });
  it('excludes lowercase currency from the DTO and overdue database predicate', async () => {
    const s = setup();
    expect(
      toInvoiceDto({
        ...s.state().invoice,
        currency: 'usd',
        dueAt: new Date(0),
      }),
    ).toMatchObject({ needsPricing: true, overdue: false });
    await s.service.runDailyChecks();
    const filter = s.repo.find.mock.calls[0][0].where.currency;
    expect(filter.type).toBe('raw');
    expect(filter.getSql('currency')).toBe("currency ~ '^[A-Z]{3}$'");
  });
});
