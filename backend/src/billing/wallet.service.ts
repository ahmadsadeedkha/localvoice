import { DataSource } from 'typeorm';
import { TenantWallet } from './tenant-wallet.entity';
import { CreditLedger } from './credit-ledger.entity';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

export type CallGate =
  | { allowed: true; maxDurationMs: number }
  | { allowed: false; reason: 'no_balance' | 'invoice_unpaid' | 'no_wallet' };

export type TopUpType = 'purchase' | 'grant' | 'adjustment';

@Injectable()
export class WalletService {
  constructor(private ds: DataSource) {}

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
    const w = await this.ds
      .getRepository(TenantWallet)
      .findOne({ where: { tenantId } });
    if (!w) return { allowed: false, reason: 'no_wallet' };
    if (w.blockedReason === 'invoice_unpaid') {
      return { allowed: false, reason: 'invoice_unpaid' };
    }

    const perMinute = Number(process.env.CREDITS_PER_MINUTE ?? 1);
    const minMinutes = Number(process.env.MIN_CALL_MINUTES ?? 2);
    const maxMinutes = Number(process.env.MAX_CALL_MINUTES ?? 30);

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

  async getWallet(tenantId: string) {
    return this.ds.getRepository(TenantWallet).findOne({ where: { tenantId } });
  }

  async topUp(p: {
    tenantId: string;
    credits: number;
    type?: TopUpType;
    paymentRef?: string; // gateway transaction id; required for 'purchase'
    note?: string;
  }) {
    if (!Number.isFinite(p.credits) || p.credits <= 0) {
      throw new BadRequestException('credits must be a positive number');
    }
    const type = p.type ?? 'adjustment';
    if (type === 'purchase' && !p.paymentRef) {
      throw new BadRequestException('purchase requires a paymentRef');
    }

    return this.ds.transaction(async (m) => {
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
    });
  }
}
