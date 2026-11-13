import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import {
  Between,
  DataSource,
  EntityManager,
  LessThanOrEqual,
  MoreThan,
  Raw,
  Repository,
} from 'typeorm';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { TenantWallet } from './tenant-wallet.entity';
import { WalletService } from './wallet.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_INVOICE_DUE_DAYS = 7;
export class InvoiceNeedsPricingError extends ConflictException {
  constructor() {
    super('Set a positive price and currency before issuing this invoice');
  }
}
const round2 = (n: number) => Math.round(n * 100) / 100;
const priced = (i: Pick<Invoice, 'pricePerCredit' | 'amount' | 'currency'>) =>
  i.pricePerCredit != null &&
  Number.isFinite(i.pricePerCredit) &&
  i.pricePerCredit > 0 &&
  i.amount != null &&
  Number.isFinite(i.amount) &&
  i.amount > 0 &&
  !!i.currency?.match(/^[A-Z]{3}$/);
const payable = () => ({
  pricePerCredit: MoreThan(0),
  amount: MoreThan(0),
  currency: Raw((column) => `${column} ~ '^[A-Z]{3}$'`),
});

// Billing months are UTC calendar months.
export const monthStartUtc = (year: number, month1to12: number) =>
  new Date(Date.UTC(year, month1to12 - 1, 1));
const addMonthUtc = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

export const toInvoiceDto = (i: Invoice) => ({
  id: i.id,
  tenantId: i.tenantId,
  periodStart: i.periodStart,
  periodEnd: i.periodEnd,
  creditsUsed: i.creditsUsed,
  pricePerCredit: i.pricePerCredit,
  currency: i.currency,
  amount: i.amount,
  status: i.status,
  issuedAt: i.issuedAt,
  dueAt: i.dueAt,
  paidAt: i.paidAt,
  needsPricing: !priced(i),
  overdue:
    priced(i) &&
    i.status === InvoiceStatus.Open &&
    i.dueAt.getTime() <= Date.now(),
});

@Injectable()
export class InvoicesService {
  private readonly log = new Logger(InvoicesService.name);

  constructor(
    private readonly ds: DataSource,
    private readonly wallets: WalletService,
    @InjectRepository(Invoice) private readonly invoices: Repository<Invoice>,
    @InjectQueue('notifications') private readonly notifications: Queue,
  ) {}

  // ---------- generation ----------

  private async usedCredits(tenantId: string, from: Date, to: Date) {
    const rows: { used: string }[] = await this.ds.query(
      `SELECT COALESCE(-SUM(credits), 0) AS used
         FROM credit_ledger
        WHERE tenant_id = $1 AND type = 'call_charge'
          AND created_at >= $2 AND created_at < $3`,
      [tenantId, from, to],
    );
    return Number(rows[0]?.used ?? 0);
  }

  /** Idempotent: one invoice per tenant per month. Returns null if nothing to bill. */
  async generateForTenant(tenantId: string, periodStart: Date) {
    const periodEnd = addMonthUtc(periodStart);
    if (
      !Number.isFinite(periodStart.getTime()) ||
      periodStart.getTime() !==
        monthStartUtc(
          periodStart.getUTCFullYear(),
          periodStart.getUTCMonth() + 1,
        ).getTime() ||
      periodEnd.getTime() > Date.now()
    ) {
      throw new BadRequestException(
        'Only completed UTC calendar months can be invoiced',
      );
    }
    const wallet = await this.ds
      .getRepository(TenantWallet)
      .findOne({ where: { tenantId } });
    if (!wallet || wallet.billingMode !== 'postpaid') return null;

    const existing = await this.invoices.findOne({
      where: { tenantId, periodStart },
    });
    if (existing) return { invoice: existing, created: false };

    const used = await this.usedCredits(tenantId, periodStart, periodEnd);
    if (used <= 0) return null;

    const issuedAt = new Date();
    const rate = wallet.pricePerCredit;
    if (
      rate == null ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      !wallet.currency?.match(/^[A-Z]{3}$/)
    ) {
      throw new InvoiceNeedsPricingError();
    }
    const amount = round2(used * rate);
    if (amount <= 0) {
      this.log.warn(
        `Tenant ${tenantId}: usage rounds to 0.00 for ${periodStart.toISOString().slice(0, 7)}; no invoice issued`,
      );
      return null;
    }
    try {
      const invoice = await this.invoices.save(
        this.invoices.create({
          tenantId,
          periodStart,
          periodEnd,
          creditsUsed: used,
          pricePerCredit: rate,
          currency: wallet.currency,
          amount,
          status: InvoiceStatus.Open,
          issuedAt,
          issueNoticePending: true,
          dueAt: new Date(issuedAt.getTime() + wallet.invoiceDueDays * DAY_MS),
        }),
      );
      return { invoice, created: true };
    } catch (e) {
      // another run created it first (unique tenant + period)
      const again = await this.invoices.findOne({
        where: { tenantId, periodStart },
      });
      if (again) return { invoice: again, created: false };
      throw e;
    }
  }

  async generateForPeriod(periodStart: Date) {
    const rows: { tenant_id: string }[] = await this.ds.query(
      `SELECT tenant_id FROM tenant_wallets WHERE billing_mode = 'postpaid'`,
    );
    let created = 0;
    let failed = 0;
    const needsPricing: string[] = [];
    for (const { tenant_id } of rows) {
      try {
        const r = await this.generateForTenant(tenant_id, periodStart);
        if (r?.created) {
          created++;
        }
        if (r?.invoice.issueNoticePending) await this.notifyIssued(r.invoice);
      } catch (e) {
        if (e instanceof InvoiceNeedsPricingError) {
          needsPricing.push(tenant_id);
          this.log.warn(`Tenant ${tenant_id} needs pricing before invoicing`);
          continue;
        }
        failed++;
        this.log.error(
          `Invoice generation failed for tenant ${tenant_id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (needsPricing.length) {
      await this.notifications.add(
        'invoice-needs-pricing',
        {
          tenantIds: needsPricing,
          period: periodStart.toISOString().slice(0, 7),
        },
        {
          jobId: `invoice-needs-pricing-${periodStart.getTime()}`,
          removeOnComplete: 100,
          removeOnFail: { age: 7 * 86400, count: 1000 },
        },
      );
    }
    // Known pricing gaps are visible through the admin list; real failures retry.
    if (failed > 0)
      throw new Error(`${failed} tenant(s) failed invoice generation`);
    return { tenants: rows.length, created, needsPricing: needsPricing.length };
  }

  async notifyIssued(invoice: Invoice) {
    await this.notifications.add(
      'invoice-issued',
      {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        dueAt: invoice.dueAt,
      },
      {
        jobId: `invoice-issued-${invoice.id}-${invoice.dueAt.getTime()}`,
        removeOnComplete: 1000,
        removeOnFail: { age: 7 * 86400, count: 1000 },
      },
    );
    await this.invoices.update(
      { id: invoice.id, dueAt: invoice.dueAt },
      { issueNoticePending: false },
    );
  }

  // ---------- daily reminders + blocking ----------

  async runDailyChecks() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 3 * DAY_MS);

    // 1) reminders for invoices falling due within 3 days
    const upcoming = await this.invoices.find({
      where: {
        ...payable(),
        status: InvoiceStatus.Open,
        dueAt: Between(new Date(now.getTime() + 1), horizon),
      },
    });
    let reminded = 0;
    for (const inv of upcoming) {
      const daysLeft = Math.ceil(
        (inv.dueAt.getTime() - now.getTime()) / DAY_MS,
      );
      const send1d = daysLeft <= 1 && !inv.reminder1dSentAt;
      const send3d = !send1d && daysLeft <= 3 && !inv.reminder3dSentAt;
      if (!send1d && !send3d) continue;

      await this.notifications.add('invoice-reminder', {
        tenantId: inv.tenantId,
        invoiceId: inv.id,
        daysLeft,
        dueAt: inv.dueAt,
      });
      if (send1d) {
        inv.reminder1dSentAt = now;
        if (!inv.reminder3dSentAt) inv.reminder3dSentAt = now;
      } else {
        inv.reminder3dSentAt = now;
      }
      await this.invoices.update(
        { id: inv.id, status: InvoiceStatus.Open },
        {
          reminder1dSentAt: inv.reminder1dSentAt,
          reminder3dSentAt: inv.reminder3dSentAt,
        },
      );
      reminded++;
    }

    // 2) block tenants that have an unpaid invoice past its due date
    const overdue = await this.invoices.find({
      where: {
        ...payable(),
        status: InvoiceStatus.Open,
        dueAt: LessThanOrEqual(now),
      },
    });
    let blocked = 0;
    for (const tenantId of new Set(overdue.map((i) => i.tenantId))) {
      if (await this.blockForOverdue(tenantId)) {
        blocked++;
        await this.notifications.add('invoice-overdue-blocked', { tenantId });
      }
    }
    // Legacy unpriced invoices must not leave tenants on a stale billing hold.
    const held = await this.ds
      .getRepository(TenantWallet)
      .find({ where: { blockedReason: 'invoice_unpaid' } });
    for (const w of held) {
      await this.ds.transaction((m) => this.releaseInvoiceBlock(m, w.tenantId));
    }
    const pending = await this.invoices.find({
      where: {
        ...payable(),
        status: InvoiceStatus.Open,
        issueNoticePending: true,
      },
    });
    for (const invoice of pending) await this.notifyIssued(invoice);
    return { reminded, blocked };
  }

  private async blockForOverdue(tenantId: string): Promise<boolean> {
    return this.ds.transaction(async (m) => {
      const w = await m.findOne(TenantWallet, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!w || w.blockedReason === 'invoice_unpaid') return false;
      const overdue = await m.count(Invoice, {
        where: {
          ...payable(),
          tenantId,
          status: InvoiceStatus.Open,
          dueAt: LessThanOrEqual(new Date()),
        },
      });
      if (!overdue) return false;
      w.blockedReason = 'invoice_unpaid';
      await m.save(w);
      return true;
    });
  }

  /** Lift the invoice block once no open invoice is past due. */
  private async releaseInvoiceBlock(m: EntityManager, tenantId: string) {
    const stillOverdue = await m.count(Invoice, {
      where: {
        ...payable(),
        tenantId,
        status: InvoiceStatus.Open,
        dueAt: LessThanOrEqual(new Date()),
      },
    });
    if (stillOverdue > 0) return;
    const w = await m.findOne(TenantWallet, {
      where: { tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (w && w.blockedReason === 'invoice_unpaid') {
      w.blockedReason = null;
      await m.save(w);
    }
  }

  // ---------- admin actions ----------

  async markPaid(invoiceId: string, adminId: string, reference?: string) {
    return this.ds.transaction(async (m) => {
      const locked = await m.findOne(Invoice, {
        where: { id: invoiceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Invoice not found');
      if (locked.status === InvoiceStatus.Void)
        throw new ConflictException('Invoice is void');
      if (locked.status === InvoiceStatus.Open) {
        if (!priced(locked))
          throw new ConflictException(
            'Price this invoice before recording payment',
          );
        await this.wallets.topUp(
          {
            tenantId: locked.tenantId,
            credits: locked.creditsUsed,
            type: 'purchase',
            paymentRef: `invoice-${locked.id}`,
            note: `Invoice paid (admin: ${adminId})`,
          },
          m,
        );
        locked.status = InvoiceStatus.Paid;
        locked.paidAt = new Date();
        locked.paymentRef = reference ?? null;
        await m.save(locked);
      }
      await this.releaseInvoiceBlock(m, locked.tenantId);
      return locked;
    });
  }

  async voidInvoice(invoiceId: string) {
    return this.ds.transaction(async (m) => {
      const locked = await m.findOne(Invoice, {
        where: { id: invoiceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Invoice not found');
      if (locked.status === InvoiceStatus.Paid)
        throw new ConflictException('A paid invoice cannot be voided');
      if (locked.status === InvoiceStatus.Void) return locked;
      locked.status = InvoiceStatus.Void;
      await m.save(locked);
      await this.releaseInvoiceBlock(m, locked.tenantId);
      return locked;
    });
  }

  /** Set the price on one open invoice (useful when the tenant had no price at issue time). */
  async setPrice(invoiceId: string, pricePerCredit: number, currency: string) {
    const result = await this.ds.transaction(async (m) => {
      const invoice = await m.findOne(Invoice, {
        where: { id: invoiceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');
      if (invoice.status !== InvoiceStatus.Open) {
        throw new ConflictException('Only open invoices can be re-priced');
      }
      const wasUnpriced = !priced(invoice);
      invoice.pricePerCredit = pricePerCredit;
      invoice.currency = currency;
      invoice.amount = round2(invoice.creditsUsed * pricePerCredit);
      if (!priced(invoice))
        throw new BadRequestException(
          'Invoice needs a positive amount and currency',
        );
      if (wasUnpriced) {
        const wallet = await m.findOne(TenantWallet, {
          where: { tenantId: invoice.tenantId },
        });
        invoice.dueAt = new Date(
          Date.now() +
            (wallet?.invoiceDueDays ?? DEFAULT_INVOICE_DUE_DAYS) * DAY_MS,
        );
        invoice.issueNoticePending = true;
        invoice.reminder1dSentAt = null;
        invoice.reminder3dSentAt = null;
      }
      await m.save(invoice);
      await this.releaseInvoiceBlock(m, invoice.tenantId);
      return invoice;
    });
    if (result.issueNoticePending) await this.notifyIssued(result);
    return result;
  }

  /** Persistent admin recovery list, independent of notification delivery. */
  async needsPricing() {
    return this.ds.query(`
      SELECT w.tenant_id AS "tenantId", t.name AS "tenantName",
             date_trunc('month', l.created_at AT TIME ZONE 'UTC') AS "periodStart",
             -SUM(l.credits) AS "creditsUsed"
      FROM tenant_wallets w JOIN tenants t ON t.id = w.tenant_id
      JOIN credit_ledger l ON l.tenant_id = w.tenant_id AND l.type = 'call_charge'
      WHERE w.billing_mode = 'postpaid'
        AND (w.price_per_credit IS NULL OR w.price_per_credit <= 0
             OR w.currency IS NULL OR w.currency !~ '^[A-Z]{3}$')
        AND l.created_at < date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.tenant_id = w.tenant_id
          AND i.period_start = date_trunc('month', l.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
      GROUP BY w.tenant_id, t.name, date_trunc('month', l.created_at AT TIME ZONE 'UTC')
      ORDER BY "periodStart", "tenantName"`);
  }

  // ---------- reads ----------

  listForTenant(tenantId: string) {
    return this.invoices.find({
      where: { tenantId },
      order: { periodStart: 'DESC' },
      take: 36,
    });
  }

  /** What a tenant sees: usage so far this month plus their invoices. */
  async overviewForTenant(tenantId: string) {
    const wallet = await this.ds
      .getRepository(TenantWallet)
      .findOne({ where: { tenantId } });
    const now = new Date();
    const start = monthStartUtc(now.getUTCFullYear(), now.getUTCMonth() + 1);
    const end = addMonthUtc(start);
    const [creditsUsed, invoices] = await Promise.all([
      this.usedCredits(tenantId, start, end),
      this.listForTenant(tenantId),
    ]);
    return {
      billingMode: wallet?.billingMode ?? 'prepaid',
      wallet: {
        balanceCredits: wallet?.balanceCredits ?? 0,
        creditLimit: wallet?.creditLimit ?? 0,
        lowBalanceThreshold: wallet?.lowBalanceThreshold ?? 10,
        pricePerCredit: wallet?.pricePerCredit ?? null,
        currency: wallet?.currency ?? null,
        invoiceDueDays: wallet?.invoiceDueDays ?? 7,
        blockedReason: wallet?.blockedReason ?? null,
      },
      currentPeriod: { periodStart: start, periodEnd: end, creditsUsed },
      invoices: invoices.map(toInvoiceDto),
    };
  }
}
