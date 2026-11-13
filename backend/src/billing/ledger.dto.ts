import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** calls = per-call deductions, credits = everything else (top-ups, grants, ...). */
export type LedgerGroup = 'calls' | 'credits';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
  group: z.enum(['calls', 'credits']).optional(),
});

export function parseLedgerQuery(query: unknown) {
  const r = querySchema.safeParse(query ?? {});
  if (!r.success) {
    throw new BadRequestException(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  return r.data;
}

/** One ledger entry joined to its call (when it has one). */
export interface LedgerRow {
  id: string;
  type: string;
  credits: string | number;
  balanceAfter: string | number;
  note: string | null;
  paymentRef: string | null;
  providerCostCents: number | null;
  callId: string | null;
  createdAt: Date;
  callRowId: string | null;
  fromNumber: string | null;
  durationMs: number | null;
}

const tenantDescription: Record<string, string> = {
  call_charge: 'Call',
  purchase: 'Credits purchased',
  grant: 'Bonus credits',
  adjustment: 'Balance adjustment',
  refund: 'Refund',
  expiry: 'Credits expired',
};

/**
 * What a business sees. Deliberately leaves out the provider cost, payment
 * references and admin notes (those carry internal ids and our margin).
 */
export const toTenantLedgerDto = (r: LedgerRow) => ({
  id: r.id,
  type: r.type,
  description: tenantDescription[r.type] ?? 'Balance change',
  credits: Number(r.credits),
  balanceAfter: Number(r.balanceAfter),
  createdAt: r.createdAt,
  call: r.callRowId
    ? {
        id: r.callRowId,
        fromNumber: r.fromNumber,
        durationMs: r.durationMs,
      }
    : null,
});

/** Full detail for platform admins. */
export const toAdminLedgerDto = (r: LedgerRow) => ({
  id: r.id,
  type: r.type,
  credits: Number(r.credits),
  balanceAfter: Number(r.balanceAfter),
  note: r.note,
  paymentRef: r.paymentRef,
  providerCostCents: r.providerCostCents,
  callId: r.callId,
  fromNumber: r.fromNumber,
  durationMs: r.durationMs,
  createdAt: r.createdAt,
});
