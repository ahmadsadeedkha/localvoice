import { Suspense } from "react";
import {
  AlertTriangle,
  CreditCard,
  Receipt,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import {
  formatBillingDate,
  formatCredits,
  formatMoney,
  formatPeriod,
  type BillingOverview,
  type Invoice,
} from "@/lib/billing-types";

function Notice({
  tone,
  children,
}: {
  tone: "warning" | "danger";
  children: React.ReactNode;
}) {
  const cls =
    tone === "danger"
      ? "bg-destructive-soft text-destructive"
      : "bg-warning-soft text-warning";
  const Icon = tone === "danger" ? ShieldAlert : AlertTriangle;
  return (
    <div className={`mb-4 flex gap-2 rounded-lg px-3 py-2.5 text-sm ${cls}`}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

function InvoiceStatusBadge({ invoice }: { invoice: Invoice }) {
  let label = "Open";
  let cls = "bg-info-soft text-info";
  if (invoice.status === "paid") {
    label = "Paid";
    cls = "bg-success-soft text-success";
  } else if (invoice.status === "void") {
    label = "Void";
    cls = "bg-muted text-muted-foreground";
  } else if (invoice.needsPricing) {
    // Tenants don't need the internal "needs pricing" state, just that it's coming.
    label = "Being prepared";
    cls = "bg-muted text-muted-foreground";
  } else if (invoice.overdue) {
    label = "Overdue";
    cls = "bg-destructive-soft text-destructive";
  }
  return (
    <Badge variant="outline" className={`border-transparent ${cls}`}>
      {label}
    </Badge>
  );
}

const columns: Column<Invoice>[] = [
  {
    key: "period",
    header: "Month",
    cell: (i) => (
      <span className="font-medium">{formatPeriod(i.periodStart)}</span>
    ),
  },
  {
    key: "credits",
    header: "Credits used",
    className: "tabular-nums",
    cell: (i) => formatCredits(i.creditsUsed),
  },
  {
    key: "amount",
    header: "Amount",
    className: "tabular-nums",
    cell: (i) => formatMoney(i.amount, i.currency),
  },
  {
    key: "due",
    header: "Due",
    cell: (i) =>
      i.status === "paid" && i.paidAt
        ? `Paid ${formatBillingDate(i.paidAt)}`
        : i.status !== "open" || i.needsPricing
          ? "—"
          : formatBillingDate(i.dueAt),
  },
  {
    key: "status",
    header: "Status",
    cell: (i) => <InvoiceStatusBadge invoice={i} />,
  },
];

async function load(): Promise<BillingOverview | "forbidden"> {
  try {
    return await apiFetch<BillingOverview>("/billing/invoices");
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) return "forbidden";
    throw e;
  }
}

async function BillingContent() {
  const data = await load();

  if (data === "forbidden") {
    return (
      <EmptyState
        icon={Wallet}
        title="Billing is for owners and admins"
        description="Ask an owner or admin of your business to review credits and invoices."
      />
    );
  }

  const { wallet, billingMode, currentPeriod, invoices } = data;
  const postpaid = billingMode === "postpaid";
  const available = wallet.balanceCredits + wallet.creditLimit;
  // For postpaid the threshold is negative (e.g. 80% of the limit used),
  // so the same comparison covers both modes.
  const lowBalance =
    !wallet.blockedReason &&
    wallet.balanceCredits <= wallet.lowBalanceThreshold;

  const overdueInvoice = invoices.find((i) => i.overdue);

  return (
    <>
      {wallet.blockedReason === "invoice_unpaid" && (
        <Notice tone="danger">
          <strong>An invoice is overdue, so your phone agent is paused.</strong>{" "}
          Callers are not being answered by the agent until it is paid
          {overdueInvoice
            ? ` (${formatPeriod(overdueInvoice.periodStart)}, ${formatMoney(overdueInvoice.amount, overdueInvoice.currency)})`
            : ""}
          . Contact support once you have paid.
        </Notice>
      )}
      {wallet.blockedReason === "no_balance" && (
        <Notice tone="danger">
          <strong>
            {postpaid
              ? "You have reached your credit limit, so your phone agent is paused."
              : "You are out of credits, so your phone agent is paused."}
          </strong>{" "}
          Contact support to {postpaid ? "settle your balance" : "add credits"}.
        </Notice>
      )}
      {lowBalance && (
        <Notice tone="warning">
          {postpaid
            ? "You are close to your credit limit. Calls will pause when it is reached."
            : "Your credits are running low. Calls will pause when they run out."}
        </Notice>
      )}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={postpaid ? "Balance" : "Credits left"}
          value={formatCredits(wallet.balanceCredits)}
          hint={
            postpaid
              ? "Negative means usage not yet paid for"
              : "1 credit per call minute, rounded up"
          }
          icon={Wallet}
        />
        {postpaid && (
          <StatCard
            label="Available to use"
            value={formatCredits(Math.max(available, 0))}
            hint={`Credit limit ${formatCredits(wallet.creditLimit)}`}
            icon={CreditCard}
          />
        )}
        <StatCard
          label="Used this month"
          value={formatCredits(currentPeriod.creditsUsed)}
          hint={`${formatPeriod(currentPeriod.periodStart)} (UTC)`}
          icon={Receipt}
        />
        {wallet.pricePerCredit != null && wallet.currency && (
          <StatCard
            label="Price per credit"
            value={formatMoney(wallet.pricePerCredit, wallet.currency)}
          />
        )}
      </div>

      <h2 className="mb-3 text-lg font-semibold">Invoices</h2>
      <DataTable
        columns={columns}
        rows={invoices}
        getRowId={(i) => i.id}
        empty={
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            description={
              postpaid
                ? "Your first invoice is issued on the 1st of next month for this month's usage."
                : "You are on prepaid credits, so there is nothing to invoice."
            }
          />
        }
      />
      <p className="mt-3 text-xs text-muted-foreground">
        Billing months and due dates use UTC. To add credits or pay an invoice,
        contact support.
      </p>
    </>
  );
}

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Your credits, usage and invoices."
      />
      <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
        <BillingContent />
      </Suspense>
    </>
  );
}
