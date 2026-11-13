import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantWallet } from './tenant-wallet.entity';
import { Invoice, InvoiceStatus } from './invoice.entity';

export interface BillingSettingsPatch {
  billingMode?: 'prepaid' | 'postpaid';
  creditLimit?: number;
  lowBalanceThreshold?: number;
  pricePerCredit?: number | null;
  currency?: string | null;
  invoiceDueDays?: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class BillingSettingsService {
  constructor(private readonly ds: DataSource) {}

  /** Read-only view for the admin UI. Null wallet means the tenant never had one. */
  async get(tenantId: string) {
    const rows: { name: string }[] = await this.ds.query(
      `SELECT name FROM tenants WHERE id = $1`,
      [tenantId],
    );
    if (rows.length === 0) throw new NotFoundException('Unknown tenant');
    const wallet = await this.ds
      .getRepository(TenantWallet)
      .findOne({ where: { tenantId } });
    return { tenantName: rows[0].name, wallet };
  }

  async update(tenantId: string, patch: BillingSettingsPatch) {
    return this.ds.transaction(async (m) => {
      const tenant = await m.query(`SELECT 1 FROM tenants WHERE id = $1`, [
        tenantId,
      ]);
      if (tenant.length === 0) throw new NotFoundException('Unknown tenant');

      await m.query(
        `INSERT INTO tenant_wallets (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [tenantId],
      );
      const w = await m.findOneOrFail(TenantWallet, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      const modeBefore = w.billingMode;
      const mode = patch.billingMode ?? w.billingMode;
      // prepaid never has a credit limit
      const limit =
        mode === 'prepaid' ? 0 : (patch.creditLimit ?? w.creditLimit);

      if (mode === 'postpaid' && limit <= 0) {
        throw new BadRequestException('Postpaid needs a credit limit above 0');
      }

      if (mode === 'prepaid' && modeBefore === 'postpaid') {
        const openInvoices = await m.count(Invoice, {
          where: { tenantId, status: InvoiceStatus.Open },
        });
        if (openInvoices > 0 || w.balanceCredits < 0) {
          throw new ConflictException(
            'Settle open invoices and the negative balance before switching to prepaid',
          );
        }
      }

      w.billingMode = mode;
      w.creditLimit = limit;

      if (patch.lowBalanceThreshold !== undefined) {
        w.lowBalanceThreshold = patch.lowBalanceThreshold;
        w.lowBalanceNotifiedAt = null;
      } else if (mode !== modeBefore) {
        // postpaid: alert when 80% of the limit is used (balance is negative);
        // prepaid: alert at 10 credits left
        w.lowBalanceThreshold = mode === 'postpaid' ? -round2(limit * 0.8) : 10;
        w.lowBalanceNotifiedAt = null;
      }

      if (patch.pricePerCredit !== undefined)
        w.pricePerCredit = patch.pricePerCredit;
      if (patch.currency !== undefined) w.currency = patch.currency;
      if (patch.invoiceDueDays !== undefined)
        w.invoiceDueDays = patch.invoiceDueDays;

      await m.save(w);
      return w;
    });
  }
}
