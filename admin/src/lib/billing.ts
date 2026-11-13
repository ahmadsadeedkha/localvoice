export type BillingMode = "prepaid" | "postpaid";
export type BlockedReason = "no_balance" | "invoice_unpaid" | null;
export type InvoiceStatus = "open" | "paid" | "void";

export type TenantBilling = {
  tenantName: string;
  tenantId: string;
  billingMode: BillingMode;
  balanceCredits: number;
  creditLimit: number;
  lowBalanceThreshold: number;
  pricePerCredit: number | null;
  currency: string | null;
  invoiceDueDays: number;
  blockedReason: BlockedReason;
};

export type Invoice = {
  id: string;
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  creditsUsed: number;
  pricePerCredit: number | null;
  currency: string | null;
  amount: number | null;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  paidAt: string | null;
  needsPricing: boolean;
  overdue: boolean;
};

export type NeedsPricingItem = {
  tenantId: string;
  tenantName: string;
  periodStart: string;
  creditsUsed: string | number;
};

export function formatCredits(n: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(
    n,
  );
}

export function formatMoney(amount: number | null, currency: string | null) {
  if (amount == null || !currency) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Billing months are UTC calendar months, so always render them in UTC. */
export function formatPeriod(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export const blockedLabel: Record<NonNullable<BlockedReason>, string> = {
  no_balance: "Out of credits",
  invoice_unpaid: "Invoice overdue",
};

/** Previous completed UTC month, the usual one to invoice by hand. */
export function lastCompletedMonth() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
