export type BillingMode = "prepaid" | "postpaid";
export type BlockedReason = "no_balance" | "invoice_unpaid" | null;
export type InvoiceStatus = "open" | "paid" | "void";

export type Invoice = {
  id: string;
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

export type BillingOverview = {
  billingMode: BillingMode;
  wallet: {
    balanceCredits: number;
    creditLimit: number;
    lowBalanceThreshold: number;
    pricePerCredit: number | null;
    currency: string | null;
    invoiceDueDays: number;
    blockedReason: BlockedReason;
  };
  currentPeriod: {
    periodStart: string;
    periodEnd: string;
    creditsUsed: number;
  };
  invoices: Invoice[];
};

export function formatCredits(n: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n);
}

export function formatMoney(
  amount: number | null,
  currency: string | null,
): string {
  if (amount == null || !currency) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Billing months are UTC calendar months, so they are always shown in UTC. */
export function formatPeriod(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function formatBillingDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export type LedgerEntry = {
  id: string;
  type: string;
  description: string;
  credits: number;
  balanceAfter: number;
  createdAt: string;
  call: {
    id: string;
    fromNumber: string | null;
    durationMs: number | null;
  } | null;
};

export type LedgerPage = {
  items: LedgerEntry[];
  total: number;
  timezone: string;
};
