import { Suspense } from "react";
import Link from "next/link";
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
import { Pagination } from "@/components/pagination";
import { PhoneNumber } from "@/components/phone-number";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDateTime, formatDuration } from "@/lib/format";
import {
  formatBillingDate,
  formatCredits,
  formatMoney,
  formatPeriod,
  type BillingOverview,
  type Invoice,
  type LedgerEntry,
  type LedgerPage,
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

const HISTORY_PAGE_SIZE = 20;

type HistoryGroup = "calls" | "credits" | undefined;

const historyTabs: { group: HistoryGroup; label: string }[] = [
  { group: undefined, label: "All" },
  { group: "calls", label: "Calls" },
  { group: "credits", label: "Top-ups & adjustments" },
];

function historyHref(group: HistoryGroup, page: number) {
  const q = new URLSearchParams();
  if (group) q.set("history", group);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return `/billing${qs ? `?${qs}` : ""}`;
}

async function CreditHistory({
  searchParams,
}: Pick<PageProps<"/billing">, "searchParams">) {
  const sp = await searchParams;
  const rawPage = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const rawGroup = Array.isArray(sp.history) ? sp.history[0] : sp.history;
  const group: HistoryGroup =
    rawGroup === "calls" || rawGroup === "credits" ? rawGroup : undefined;
  const page = Math.max(Number(rawPage) || 1, 1);

  const data = await apiFetch<LedgerPage>(
    `/billing/ledger?limit=${HISTORY_PAGE_SIZE}&offset=${(page - 1) * HISTORY_PAGE_SIZE}${group ? `&group=${group}` : ""}`,
  );
  const pages = Math.max(Math.ceil(data.total / HISTORY_PAGE_SIZE), 1);

  const columns: Column<LedgerEntry>[] = [
    {
      key: "when",
      header: "When",
      cell: (e) => formatDateTime(e.createdAt, data.timezone),
    },
    {
      key: "details",
      header: "Details",
      cell: (e) =>
        e.call ? (
          <Link
            href={`/calls/${e.call.id}`}
            className="font-medium hover:underline"
          >
            Call from <PhoneNumber value={e.call.fromNumber} />
            <span className="text-muted-foreground">
              {" "}
              · {formatDuration(e.call.durationMs)}
            </span>
          </Link>
        ) : (
          <span className="font-medium">{e.description}</span>
        ),
    },
    {
      key: "credits",
      header: "Credits",
      className: "tabular-nums",
      cell: (e) => (
        <span className={e.credits > 0 ? "text-success" : undefined}>
          {e.credits > 0 ? "+" : ""}
          {formatCredits(e.credits)}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Balance after",
      className: "tabular-nums",
      cell: (e) => formatCredits(e.balanceAfter),
    },
  ];

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        {historyTabs.map((t) => (
          <Button
            key={t.label}
            asChild
            size="sm"
            variant={t.group === group ? "secondary" : "outline"}
          >
            <Link href={historyHref(t.group, 1)}>{t.label}</Link>
          </Button>
        ))}
      </div>
      <DataTable
        columns={columns}
        rows={data.items}
        getRowId={(e) => e.id}
        empty={
          <EmptyState
            icon={Wallet}
            title="No activity yet"
            description="Each call your agent answers, and every credit top-up, shows up here."
          />
        }
      />
      <Pagination
        page={page}
        pages={pages}
        total={data.total}
        noun="entries"
        hrefFor={(n) => historyHref(group, n)}
      />
    </>
  );
}

async function BillingContent({
  searchParams,
}: Pick<PageProps<"/billing">, "searchParams">) {
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
      <h2 className="mt-10 mb-3 text-lg font-semibold">Credit history</h2>
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
        <CreditHistory searchParams={searchParams} />
      </Suspense>

      <p className="mt-3 text-xs text-muted-foreground">
        Billing months and due dates use UTC. To add credits or pay an invoice,
        contact support.
      </p>
    </>
  );
}

export default function BillingPage({ searchParams }: PageProps<"/billing">) {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Your credits, usage and invoices."
      />
      <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
        <BillingContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
