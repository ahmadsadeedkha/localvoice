import {
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
  Repository,
} from 'typeorm';
import { Invoice, InvoiceStatus } from './invoice.entity';
import { TenantWallet } from './tenant-wallet.entity';
import { WalletService } from './wallet.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;

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
  overdue: i.status === InvoiceStatus.Open && i.dueAt.getTime() <= Date.now(),
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
    const wallet = await this.ds
      .getRepository(TenantWallet)
      .findOne({ where: { tenantId } });
    if (!wallet || wallet.billingMode !== 'postpaid') return null;

    const existing = await this.invoices.findOne({
      where: { tenantId, periodStart },
    });
    if (existing) return { invoice: existing, created: false };

    const periodEnd = addMonthUtc(periodStart);
    const used = await this.usedCredits(tenantId, periodStart, periodEnd);
    if (used <= 0) return null;

    const issuedAt = new Date();
    const rate = wallet.pricePerCredit;
    try {
      const invoice = await this.invoices.save(
        this.invoices.create({
          tenantId,
          periodStart,
          periodEnd,
          creditsUsed: used,
          pricePerCredit: rate,
          currency: wallet.currency,
          amount: rate != null ? round2(used * rate) : null,
          status: InvoiceStatus.Open,
          issuedAt,
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
    for (const { tenant_id } of rows) {
      try {
        const r = await this.generateForTenant(tenant_id, periodStart);
        if (r?.created) {
          created++;
          await this.notifyIssued(r.invoice);
        }
      } catch (e) {
        failed++;
        this.log.error(
          `Invoice generation failed for tenant ${tenant_id}: ${e instanceof Error ? e.message : e}`,
        );
      }
    }
    // throwing makes BullMQ retry; already-created invoices are skipped on retry
    if (failed > 0)
      throw new Error(`${failed} tenant(s) failed invoice generation`);
    return { tenants: rows.length, created };
  }

  async notifyIssued(invoice: Invoice) {
    await this.notifications.add('invoice-issued', {
      tenantId: invoice.tenantId,
      invoiceId: invoice.id,
      dueAt: invoice.dueAt,
    });
  }

  // ---------- daily reminders + blocking ----------

  async runDailyChecks() {
    const now = new Date();
    const horizon = new Date(now.getTime() + 3 * DAY_MS);

    // 1) reminders for invoices falling due within 3 days
    const upcoming = await this.invoices.find({
      where: {
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
      await this.invoices.save(inv);
      reminded++;
    }

    // 2) block tenants that have an unpaid invoice past its due date
    const overdue = await this.invoices.find({
      where: { status: InvoiceStatus.Open, dueAt: LessThanOrEqual(now) },
    });
    let blocked = 0;
    for (const tenantId of new Set(overdue.map((i) => i.tenantId))) {
      if (await this.blockForOverdue(tenantId)) {
        blocked++;
        await this.notifications.add('invoice-overdue-blocked', { tenantId });
      }
    }
    return { reminded, blocked };
  }

  private async blockForOverdue(tenantId: string): Promise<boolean> {
    return this.ds.transaction(async (m) => {
      const w = await m.findOne(TenantWallet, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!w || w.blockedReason === 'invoice_unpaid') return false;
      w.blockedReason = 'invoice_unpaid';
      await m.save(w);
      return true;
    });
  }

  /** Lift the invoice block once no open invoice is past due. */
  private async releaseInvoiceBlock(m: EntityManager, tenantId: string) {
    const stillOverdue = await m.count(Invoice, {
      where: {
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

  private async get(invoiceId: string) {
    const invoice = await this.invoices.findOne({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async markPaid(invoiceId: string, adminId: string, reference?: string) {
    const invoice = await this.get(invoiceId);
    if (invoice.status === InvoiceStatus.Void) {
      throw new ConflictException('Invoice is void');
    }
    if (invoice.status === InvoiceStatus.Paid) return invoice;

    // Credit first. It is idempotent on paymentRef, so if marking the invoice
    // fails below and the admin retries, the wallet is never credited twice.
    await this.wallets.topUp({
      tenantId: invoice.tenantId,
      credits: invoice.creditsUsed,
      type: 'purchase',
      paymentRef: `invoice-${invoice.id}`,
      note: `Invoice paid (admin: ${adminId})`,
    });

    return this.ds.transaction(async (m) => {
      const locked = await m.findOneOrFail(Invoice, {
        where: { id: invoiceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (locked.status === InvoiceStatus.Open) {
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
    const invoice = await this.get(invoiceId);
    if (invoice.status === InvoiceStatus.Paid) {
      throw new ConflictException('A paid invoice cannot be voided');
    }
    if (invoice.status === InvoiceStatus.Void) return invoice;

    return this.ds.transaction(async (m) => {
      const locked = await m.findOneOrFail(Invoice, {
        where: { id: invoiceId },
        lock: { mode: 'pessimistic_write' },
      });
      locked.status = InvoiceStatus.Void;
      await m.save(locked);
      await this.releaseInvoiceBlock(m, locked.tenantId);
      return locked;
    });
  }

  /** Set the price on one open invoice (useful when the tenant had no price at issue time). */
  async setPrice(invoiceId: string, pricePerCredit: number, currency: string) {
    const invoice = await this.get(invoiceId);
    if (invoice.status !== InvoiceStatus.Open) {
      throw new ConflictException('Only open invoices can be re-priced');
    }
    invoice.pricePerCredit = pricePerCredit;
    invoice.currency = currency;
    invoice.amount = round2(invoice.creditsUsed * pricePerCredit);
    return this.invoices.save(invoice);
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
      currentPeriod: { periodStart: start, periodEnd: end, creditsUsed },
      invoices: invoices.map(toInvoiceDto),
    };
  }
}
