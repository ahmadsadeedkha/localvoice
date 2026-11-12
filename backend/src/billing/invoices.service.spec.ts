import { InvoicesService, monthStartUtc } from './invoices.service';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { WalletService } from './wallet.service';
import { BadRequestException } from '@nestjs/common';

function setup() {
  let state: any = {
    invoice: {
      id: 'invoice-1',
      tenantId: 'tenant-1',
      status: InvoiceStatus.Open,
      creditsUsed: 10,
    },
    wallet: {
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
      findOne: async () => ({
        billingMode: 'postpaid',
        pricePerCredit: 1,
        invoiceDueDays: 7,
      }),
    }),
    query: jest.fn().mockResolvedValue([{ used: '10' }]),
  };
  let generated: any = null;
  const repo = {
    findOne: async () => generated,
    create: (p: any) => p,
    save: async (p: any) => (generated = p),
  };
  const wallets = new WalletService(ds as any);
  const service = new InvoicesService(
    ds as any,
    wallets,
    repo as any,
    {} as any,
  );
  return {
    service,
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
