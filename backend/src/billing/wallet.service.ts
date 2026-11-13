import { DataSource, EntityManager } from 'typeorm';
import { TenantWallet } from './tenant-wallet.entity';
import { CreditLedger } from './credit-ledger.entity';
import { Tenant, TenantStatus } from '../tenants/tenant.entity';
import { ConfigService } from '@nestjs/config';
import { type LedgerGroup, type LedgerRow } from './ledger.dto';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

export type CallGate =
  | { allowed: true; maxDurationMs: number }
  | {
      allowed: false;
      reason:
        'no_balance' | 'invoice_unpaid' | 'no_wallet' | 'tenant_suspended';
    };

export type TopUpType = 'purchase' | 'grant' | 'adjustment';

@Injectable()
export class WalletService {
  constructor(
    private ds: DataSource,
    private readonly config: ConfigService,
  ) {}

  async chargeForCall(p: {
    tenantId: string;
    callId: string;
    credits: number;
    providerCostCents: number | null;
  }) {
    return this.ds.transaction(async (m) => {
      // lock the wallet row so concurrent calls charge one at a time
      const wallet = await m.findOne(TenantWallet, {
        where: { tenantId: p.tenantId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) throw new Error(`No wallet for tenant ${p.tenantId}`);

      const already = await m.exists(CreditLedger, {
        where: { type: 'call_charge', callId: p.callId },
      });
      if (already) return { charged: false as const };

      const before = wallet.balanceCredits;
      const after = +(before - p.credits).toFixed(2);

      await m.insert(CreditLedger, {
        tenantId: p.tenantId,
        type: 'call_charge',
        credits: -p.credits,
        balanceAfter: after,
        callId: p.callId,
        providerCostCents: p.providerCostCents,
      });

      wallet.balanceCredits = after;

      const crossedLow =
        before > wallet.lowBalanceThreshold &&
        after <= wallet.lowBalanceThreshold &&
        !wallet.lowBalanceNotifiedAt;
      if (crossedLow) wallet.lowBalanceNotifiedAt = new Date();

      const nowBlocked = after <= -wallet.creditLimit && !wallet.blockedReason;
      if (nowBlocked) wallet.blockedReason = 'no_balance';

      await m.save(wallet);
      return { charged: true as const, before, after, crossedLow, nowBlocked };
    });
  }

  async backfillProviderCost(callId: string, cents: number) {
    await this.ds.query(
      `UPDATE credit_ledger SET provider_cost_cents = $2
       WHERE type = 'call_charge' AND call_id = $1 AND provider_cost_cents IS NULL`,
      [callId, cents],
    );
  }

  async getCallGate(tenantId: string): Promise<CallGate> {
    const tenant = await this.ds
      .getRepository(Tenant)
      .findOne({ where: { id: tenantId } });
    if (!tenant || tenant.status === TenantStatus.Suspended) {
      return { allowed: false, reason: 'tenant_suspended' };
    }
    const w = await this.ds
      .getRepository(TenantWallet)
      .findOne({ where: { tenantId } });
    if (!w) return { allowed: false, reason: 'no_wallet' };
    if (w.blockedReason === 'invoice_unpaid') {
      return { allowed: false, reason: 'invoice_unpaid' };
    }

    const perMinute = this.config.getOrThrow<number>('CREDITS_PER_MINUTE');
    const minMinutes = this.config.getOrThrow<number>('MIN_CALL_MINUTES');
    const maxMinutes = this.config.getOrThrow<number>('MAX_CALL_MINUTES');

    // balance + credit_limit = what the tenant may still spend
    // (limit is 0 for prepaid, so this covers both billing modes)
    const minutesLeft = Math.floor(
      (w.balanceCredits + w.creditLimit) / perMinute,
    );
    if (minutesLeft < minMinutes)
      return { allowed: false, reason: 'no_balance' };

    return {
      allowed: true,
      maxDurationMs: Math.min(minutesLeft, maxMinutes) * 60_000,
    };
  }

  // for web calls and any other pre-call guard
  async assertCanStartCall(tenantId: string) {
    const gate = await this.getCallGate(tenantId);
    if (!gate.allowed) {
      throw new HttpException(
        {
          message: 'Insufficient credits or billing hold',
          reason: gate.reason,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return gate;
  }

  /** Newest first. Scoped by tenant in every query, including the call join. */
  async listLedger(
    tenantId: string,
    p: { limit: number; offset: number; group?: LedgerGroup },
  ): Promise<{ items: LedgerRow[]; total: number; timezone: string }> {
    const groupSql =
      p.group === 'calls'
        ? `AND l.type = 'call_charge'`
        : p.group === 'credits'
          ? `AND l.type <> 'call_charge'`
          : '';
    const [items, counts, tz]: [
      LedgerRow[],
      { count: number }[],
      { timezone: string }[],
    ] = await Promise.all([
      this.ds.query(
        `SELECT l.id, l.type, l.credits, l.balance_after AS "balanceAfter",
                l.note, l.payment_ref AS "paymentRef",
                l.provider_cost_cents AS "providerCostCents",
                l.call_id AS "callId", l.created_at AS "createdAt",
                c.id AS "callRowId", c.from_number AS "fromNumber",
                c.duration_ms AS "durationMs"
           FROM credit_ledger l
           LEFT JOIN calls c
             ON c.tenant_id = l.tenant_id AND c.retell_call_id = l.call_id
          WHERE l.tenant_id = $1 ${groupSql}
          ORDER BY l.created_at DESC, l.id DESC
          LIMIT $2 OFFSET $3`,
        [tenantId, p.limit, p.offset],
      ),
      this.ds.query(
        `SELECT COUNT(*)::int AS count FROM credit_ledger l
          WHERE l.tenant_id = $1 ${groupSql}`,
        [tenantId],
      ),
      this.ds.query(`SELECT timezone FROM tenants WHERE id = $1`, [tenantId]),
    ]);
    return {
      items,
      total: counts[0]?.count ?? 0,
      timezone: tz[0]?.timezone ?? 'UTC',
    };
  }

  async getWallet(tenantId: string) {
    return this.ds.getRepository(TenantWallet).findOne({ where: { tenantId } });
  }

  async topUp(
    p: {
      tenantId: string;
      credits: number;
      type?: TopUpType;
      paymentRef?: string; // gateway transaction id; required for 'purchase'
      note?: string;
    },
    manager?: EntityManager,
  ) {
    if (!Number.isFinite(p.credits) || p.credits <= 0) {
      throw new BadRequestException('credits must be a positive number');
    }
    const type = p.type ?? 'adjustment';
    if (type === 'purchase' && !p.paymentRef) {
      throw new BadRequestException('purchase requires a paymentRef');
    }

    const credit = async (m: EntityManager) => {
      const tenant = await m.query(`SELECT 1 FROM tenants WHERE id = $1`, [
        p.tenantId,
      ]);
      if (tenant.length === 0) throw new BadRequestException('Unknown tenant');

      // create the wallet if this tenant never got one
      await m.query(
        `INSERT INTO tenant_wallets (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [p.tenantId],
      );

      const wallet = await m.findOneOrFail(TenantWallet, {
        where: { tenantId: p.tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      // the same payment can't credit twice (gateway webhooks retry)
      if (p.paymentRef) {
        const dup = await m.exists(CreditLedger, {
          where: { type, paymentRef: p.paymentRef },
        });
        if (dup) {
          return { credited: false as const, balance: wallet.balanceCredits };
        }
      }

      const before = wallet.balanceCredits;
      const after = +(before + p.credits).toFixed(2);

      await m.insert(CreditLedger, {
        tenantId: p.tenantId,
        type,
        credits: p.credits,
        balanceAfter: after,
        paymentRef: p.paymentRef ?? null,
        note: p.note ?? null,
      });

      wallet.balanceCredits = after;

      // re-arm the low-balance alert once the tenant is back above the threshold
      if (after > wallet.lowBalanceThreshold)
        wallet.lowBalanceNotifiedAt = null;

      // lift a no-balance block once they can spend again;
      // 'invoice_unpaid' stays until the invoice is actually paid
      if (
        wallet.blockedReason === 'no_balance' &&
        after > -wallet.creditLimit
      ) {
        wallet.blockedReason = null;
      }

      await m.save(wallet);
      return { credited: true as const, before, after };
    };
    return manager ? credit(manager) : this.ds.transaction(credit);
  }
}
