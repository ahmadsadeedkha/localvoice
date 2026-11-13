import { useState } from "react";
import { Link, useParams } from "react-router";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useApi } from "@/lib/api";
import {
  blockedLabel,
  formatCredits,
  formatDate,
  formatDateTime,
  formatDuration,
  formatMoney,
  formatPeriod,
  formatUsdCents,
  lastCompletedMonth,
  ledgerTypeLabel,
  type AdminLedgerEntry,
  type BillingMode,
  type Invoice,
  type LedgerGroup,
  type TenantBilling,
} from "@/lib/billing";
import { cn } from "@/lib/utils";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function StatusBadge({ invoice }: { invoice: Invoice }) {
  let label = "Open";
  let style = "bg-info-soft text-info";
  if (invoice.status === "paid") {
    label = "Paid";
    style = "bg-success-soft text-success";
  } else if (invoice.status === "void") {
    label = "Void";
    style = "bg-muted text-muted-foreground";
  } else if (invoice.needsPricing) {
    label = "Needs pricing";
    style = "bg-warning-soft text-warning";
  } else if (invoice.overdue) {
    label = "Overdue";
    style = "bg-destructive-soft text-destructive";
  }
  return (
    <Badge variant="outline" className={cn("border-transparent", style)}>
      {label}
    </Badge>
  );
}

export function TenantBillingPage() {
  const { id = "" } = useParams();
  const api = useApi();
  const queryClient = useQueryClient();

  const billing = useQuery({
    queryKey: ["tenant-billing", id],
    queryFn: () => api<TenantBilling>(`/admin/tenants/${id}/billing`),
  });
  const invoices = useQuery({
    queryKey: ["tenant-invoices", id],
    queryFn: () => api<{ items: Invoice[] }>(`/admin/tenants/${id}/invoices`),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["tenant-billing", id] });
    queryClient.invalidateQueries({ queryKey: ["tenant-invoices", id] });
    queryClient.invalidateQueries({ queryKey: ["needs-pricing"] });
    queryClient.invalidateQueries({ queryKey: ["tenant-ledger", id] });
  };

  const [creditsOpen, setCreditsOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [paying, setPaying] = useState<Invoice | null>(null);
  const [pricing, setPricing] = useState<Invoice | null>(null);

  const voidInvoice = useMutation({
    mutationFn: (invoiceId: string) =>
      api<Invoice>(`/admin/invoices/${invoiceId}/void`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Invoice voided");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (billing.error) {
    return (
      <EmptyState
        icon={Receipt}
        title="Could not load billing"
        description={billing.error.message}
        action={
          <Button variant="outline" onClick={() => billing.refetch()}>
            Try again
          </Button>
        }
      />
    );
  }

  const w = billing.data;
  const items = invoices.data?.items ?? [];
  const unpriced = items.filter((i) => i.status === "open" && i.needsPricing);

  const columns: Column<Invoice>[] = [
    {
      key: "period",
      header: "Period",
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
    { key: "due", header: "Due", cell: (i) => formatDate(i.dueAt) },
    {
      key: "status",
      header: "Status",
      cell: (i) => <StatusBadge invoice={i} />,
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (i) =>
        i.status !== "open" ? null : (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setPricing(i)}>
              {i.needsPricing ? "Set price" : "Re-price"}
            </Button>
            <Button
              size="sm"
              disabled={i.needsPricing}
              title={i.needsPricing ? "Price this invoice first" : undefined}
              onClick={() => setPaying(i)}
            >
              Mark paid
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={voidInvoice.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Void the ${formatPeriod(i.periodStart)} invoice? This cannot be undone.`,
                  )
                ) {
                  voidInvoice.mutate(i.id);
                }
              }}
            >
              Void
            </Button>
          </div>
        ),
    },
  ];

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
        <Link to="/tenants">
          <ArrowLeft className="size-4" aria-hidden /> Tenants
        </Link>
      </Button>

      <PageHeader
        title={w ? `${w.tenantName} billing` : "Billing"}
        description="Credits, billing mode and invoices for this business."
        actions={
          <>
            <Button variant="outline" onClick={() => setGenerateOpen(true)}>
              Generate invoice
            </Button>
            <Button onClick={() => setCreditsOpen(true)}>Add credits</Button>
          </>
        }
      />

      {w?.blockedReason && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive-soft p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <strong>{blockedLabel[w.blockedReason]}.</strong> Inbound calls are
            currently blocked for this business.
          </p>
        </div>
      )}

      {unpriced.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            {unpriced.length} open invoice{unpriced.length > 1 ? "s" : ""} need
            a price before they can be paid or enforced.
          </p>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!w ? (
          Array.from({ length: 4 }).map((_, n) => (
            <Skeleton key={n} className="h-24 rounded-xl" />
          ))
        ) : (
          <>
            <Stat label="Mode">
              <Badge variant="outline" className="capitalize">
                {w.billingMode}
              </Badge>
            </Stat>
            <Stat label="Balance">
              <span
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  w.balanceCredits < 0 && "text-destructive",
                )}
              >
                {formatCredits(w.balanceCredits)}
              </span>
              <span className="text-xs text-muted-foreground"> credits</span>
            </Stat>
            <Stat label="Credit limit">
              <span className="text-2xl font-semibold tabular-nums">
                {w.billingMode === "postpaid"
                  ? formatCredits(w.creditLimit)
                  : "—"}
              </span>
            </Stat>
            <Stat label="Price per credit">
              <span className="text-2xl font-semibold tabular-nums">
                {formatMoney(w.pricePerCredit, w.currency)}
              </span>
            </Stat>
          </>
        )}
      </div>

      {w && (
        <SettingsCard
          key={JSON.stringify(w)}
          tenantId={id}
          wallet={w}
          onSaved={refresh}
        />
      )}

      <h2 className="mt-8 mb-3 text-lg font-semibold">Invoices</h2>
      <DataTable
        columns={columns}
        rows={items}
        getRowId={(i) => i.id}
        loading={invoices.isLoading}
        empty={
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            description="Postpaid businesses are invoiced on the 1st for the previous month. You can also generate one by hand."
          />
        }
      />

      <LedgerSection tenantId={id} />

      <Dialog open={creditsOpen} onOpenChange={setCreditsOpen}>
        <DialogContent>
          {creditsOpen && (
            <AddCreditsForm
              tenantId={id}
              onDone={() => {
                setCreditsOpen(false);
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent>
          {generateOpen && (
            <GenerateForm
              tenantId={id}
              onDone={() => {
                setGenerateOpen(false);
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent>
          {paying && (
            <MarkPaidForm
              invoice={paying}
              onDone={() => {
                setPaying(null);
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pricing} onOpenChange={(o) => !o && setPricing(null)}>
        <DialogContent>
          {pricing && w && (
            <PriceForm
              invoice={pricing}
              defaults={w}
              onDone={() => {
                setPricing(null);
                refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// ---------- credit history ----------

const LEDGER_PAGE_SIZE = 15;

function LedgerSection({ tenantId }: { tenantId: string }) {
  const api = useApi();
  const [group, setGroup] = useState<LedgerGroup>("");
  const [page, setPage] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tenant-ledger", tenantId, group, page],
    queryFn: () =>
      api<{ items: AdminLedgerEntry[]; total: number }>(
        `/admin/tenants/${tenantId}/ledger?limit=${LEDGER_PAGE_SIZE}&offset=${page * LEDGER_PAGE_SIZE}${group ? `&group=${group}` : ""}`,
      ),
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const pages = Math.max(Math.ceil(total / LEDGER_PAGE_SIZE), 1);

  const columns: Column<AdminLedgerEntry>[] = [
    { key: "when", header: "When", cell: (e) => formatDateTime(e.createdAt) },
    {
      key: "type",
      header: "Type",
      cell: (e) => (
        <Badge variant="outline">{ledgerTypeLabel[e.type] ?? e.type}</Badge>
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
    {
      key: "details",
      header: "Details",
      cell: (e) =>
        e.type === "call_charge" ? (
          <div>
            <div>
              {e.fromNumber ?? "Unknown caller"} ·{" "}
              {formatDuration(e.durationMs)}
            </div>
            {e.callId && (
              <div className="font-mono text-xs text-muted-foreground">
                {e.callId}
              </div>
            )}
          </div>
        ) : (
          <div>
            <div>{e.note ?? "—"}</div>
            {e.paymentRef && (
              <div className="font-mono text-xs text-muted-foreground">
                {e.paymentRef}
              </div>
            )}
          </div>
        ),
    },
    {
      key: "cost",
      header: "Provider cost",
      className: "tabular-nums",
      cell: (e) => formatUsdCents(e.providerCostCents),
    },
  ];

  return (
    <>
      <div className="mt-8 mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Credit history</h2>
        <select
          aria-label="Filter credit history"
          className={cn(selectClass, "w-auto")}
          value={group}
          onChange={(e) => {
            setGroup(e.target.value as LedgerGroup);
            setPage(0);
          }}
        >
          <option value="">All activity</option>
          <option value="calls">Calls only</option>
          <option value="credits">Credit changes only</option>
        </select>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error.message}</p>
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          getRowId={(e) => e.id}
          loading={isLoading}
          empty={
            <EmptyState
              icon={Receipt}
              title="No activity yet"
              description="Call charges, top-ups and grants appear here."
            />
          }
        />
      )}

      {total > LEDGER_PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} of {pages} · {total} entries
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- settings ----------

function SettingsCard({
  tenantId,
  wallet: w,
  onSaved,
}: {
  tenantId: string;
  wallet: TenantBilling;
  onSaved: () => void;
}) {
  const api = useApi();
  const [mode, setMode] = useState<BillingMode>(w.billingMode);
  const [limit, setLimit] = useState(String(w.creditLimit));
  const [price, setPrice] = useState(w.pricePerCredit?.toString() ?? "");
  const [currency, setCurrency] = useState(w.currency ?? "");
  const [dueDays, setDueDays] = useState(String(w.invoiceDueDays));
  const [threshold, setThreshold] = useState(String(w.lowBalanceThreshold));

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api(`/admin/tenants/${tenantId}/billing`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      toast.success("Billing settings saved");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const patch: Record<string, unknown> = {};

    if (mode !== w.billingMode) patch.billingMode = mode;

    if (mode === "postpaid") {
      const l = num(limit);
      if (!Number.isFinite(l) || l <= 0)
        return void toast.error("Postpaid needs a credit limit above 0");
      if (l !== w.creditLimit) patch.creditLimit = l;
    }

    const p = price.trim() === "" ? null : num(price);
    if (p !== null && (!Number.isFinite(p) || p <= 0))
      return void toast.error("Price must be a positive number");
    if (p !== w.pricePerCredit) patch.pricePerCredit = p;

    const c = currency.trim().toUpperCase() || null;
    if (c !== null && !/^[A-Z]{3}$/.test(c))
      return void toast.error("Currency must be a 3-letter code, e.g. USD");
    if (c !== w.currency) patch.currency = c;

    const d = num(dueDays);
    if (!Number.isInteger(d) || d < 1 || d > 60)
      return void toast.error("Due days must be a whole number from 1 to 60");
    if (d !== w.invoiceDueDays) patch.invoiceDueDays = d;

    const t = num(threshold);
    if (!Number.isFinite(t))
      return void toast.error("Low-balance threshold must be a number");
    if (t !== w.lowBalanceThreshold) patch.lowBalanceThreshold = t;

    if (Object.keys(patch).length === 0)
      return void toast.message("No changes to save");
    save.mutate(patch);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Billing settings</CardTitle>
        <CardDescription>
          Prepaid businesses spend credits they bought. Postpaid businesses can
          go negative up to their limit and are invoiced monthly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={submit}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Billing mode">
            <select
              className={selectClass}
              value={mode}
              onChange={(e) => setMode(e.target.value as BillingMode)}
            >
              <option value="prepaid">Prepaid</option>
              <option value="postpaid">Postpaid</option>
            </select>
          </Field>
          <Field
            label="Credit limit"
            hint={mode === "prepaid" ? "Prepaid never has a limit" : undefined}
          >
            <Input
              inputMode="decimal"
              value={mode === "prepaid" ? "0" : limit}
              disabled={mode === "prepaid"}
              onChange={(e) => setLimit(e.target.value)}
            />
          </Field>
          <Field
            label="Low-balance alert at"
            hint="Credits. Negative for postpaid."
          >
            <Input
              inputMode="decimal"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </Field>
          <Field label="Price per credit">
            <Input
              inputMode="decimal"
              placeholder="e.g. 0.12"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </Field>
          <Field label="Currency" hint="3-letter code, e.g. USD or PKR">
            <Input
              maxLength={3}
              className="uppercase"
              placeholder="USD"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </Field>
          <Field label="Invoice due after (days)">
            <Input
              inputMode="numeric"
              value={dueDays}
              onChange={(e) => setDueDays(e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save settings"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ---------- dialogs ----------

function AddCreditsForm({
  tenantId,
  onDone,
}: {
  tenantId: string;
  onDone: () => void;
}) {
  const api = useApi();
  const [credits, setCredits] = useState("");
  const [type, setType] = useState<"grant" | "adjustment">("grant");
  const [note, setNote] = useState("");

  const add = useMutation({
    mutationFn: (body: { credits: number; type: string; note: string }) =>
      api(`/admin/tenants/${tenantId}/credits`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("Credits added");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = num(credits);
    if (!Number.isFinite(n) || n <= 0 || n > 100000)
      return void toast.error("Enter credits between 0.01 and 100,000");
    if (note.trim().length < 3)
      return void toast.error("Add a short note explaining why");
    add.mutate({ credits: Math.round(n * 100) / 100, type, note: note.trim() });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add credits</DialogTitle>
        <DialogDescription>
          Every manual change is recorded in the ledger with your note.
        </DialogDescription>
      </DialogHeader>
      <Field label="Credits">
        <Input
          autoFocus
          inputMode="decimal"
          value={credits}
          onChange={(e) => setCredits(e.target.value)}
        />
      </Field>
      <Field
        label="Type"
        hint="Grant = promotional credits. Adjustment = correction."
      >
        <select
          className={selectClass}
          value={type}
          onChange={(e) => setType(e.target.value as "grant" | "adjustment")}
        >
          <option value="grant">Grant</option>
          <option value="adjustment">Adjustment</option>
        </select>
      </Field>
      <Field label="Note">
        <Input
          maxLength={200}
          placeholder="Why are you adding these?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={add.isPending}>
          {add.isPending ? "Adding…" : "Add credits"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function GenerateForm({
  tenantId,
  onDone,
}: {
  tenantId: string;
  onDone: () => void;
}) {
  const api = useApi();
  const last = lastCompletedMonth();
  const [year, setYear] = useState(String(last.year));
  const [month, setMonth] = useState(String(last.month));

  const generate = useMutation({
    mutationFn: (body: { year: number; month: number }) =>
      api<{ created: boolean; reason?: string }>(
        `/admin/tenants/${tenantId}/invoices`,
        { method: "POST", body: JSON.stringify(body) },
      ),
    onSuccess: (r) => {
      if (r.created) toast.success("Invoice created");
      else
        toast.message(r.reason ?? "An invoice already exists for that month");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const y = num(year);
    const m = num(month);
    if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12)
      return void toast.error("Enter a valid year and month (1–12)");
    generate.mutate({ year: y, month: m });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Generate invoice</DialogTitle>
        <DialogDescription>
          Bills a completed UTC month for a postpaid business. Safe to repeat:
          one invoice per month.
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Year">
          <Input
            inputMode="numeric"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </Field>
        <Field label="Month (1–12)">
          <Input
            inputMode="numeric"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </Field>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={generate.isPending}>
          {generate.isPending ? "Generating…" : "Generate"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function MarkPaidForm({
  invoice,
  onDone,
}: {
  invoice: Invoice;
  onDone: () => void;
}) {
  const api = useApi();
  const [reference, setReference] = useState("");

  const pay = useMutation({
    mutationFn: () =>
      api<Invoice>(`/admin/invoices/${invoice.id}/paid`, {
        method: "POST",
        body: JSON.stringify(
          reference.trim() ? { reference: reference.trim() } : {},
        ),
      }),
    onSuccess: () => {
      toast.success("Payment recorded");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        pay.mutate();
      }}
      className="grid gap-4"
    >
      <DialogHeader>
        <DialogTitle>Record payment</DialogTitle>
        <DialogDescription>
          {formatPeriod(invoice.periodStart)} ·{" "}
          {formatMoney(invoice.amount, invoice.currency)}. The credits used on
          this invoice are restored to the wallet, and any invoice block is
          lifted if nothing else is overdue.
        </DialogDescription>
      </DialogHeader>
      <Field
        label="Payment reference (optional)"
        hint="Bank transfer ID, receipt number…"
      >
        <Input
          autoFocus
          maxLength={150}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={pay.isPending}>
          {pay.isPending ? "Saving…" : "Mark as paid"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function PriceForm({
  invoice,
  defaults,
  onDone,
}: {
  invoice: Invoice;
  defaults: TenantBilling;
  onDone: () => void;
}) {
  const api = useApi();
  const [price, setPrice] = useState(
    (invoice.pricePerCredit ?? defaults.pricePerCredit)?.toString() ?? "",
  );
  const [currency, setCurrency] = useState(
    invoice.currency ?? defaults.currency ?? "",
  );

  const setInvoicePrice = useMutation({
    mutationFn: (body: { pricePerCredit: number; currency: string }) =>
      api<Invoice>(`/admin/invoices/${invoice.id}/price`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      toast.success("Invoice priced");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = num(price);
    const c = currency.trim().toUpperCase();
    if (!Number.isFinite(p) || p <= 0)
      return void toast.error("Price must be a positive number");
    if (!/^[A-Z]{3}$/.test(c))
      return void toast.error("Currency must be a 3-letter code");
    setInvoicePrice.mutate({ pricePerCredit: p, currency: c });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {invoice.needsPricing ? "Set price" : "Re-price invoice"}
        </DialogTitle>
        <DialogDescription>
          {formatPeriod(invoice.periodStart)} ·{" "}
          {formatCredits(invoice.creditsUsed)} credits.
          {invoice.needsPricing &&
            " Pricing restarts the payment window and notifies the business."}
        </DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Price per credit">
          <Input
            autoFocus
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </Field>
        <Field label="Currency">
          <Input
            maxLength={3}
            className="uppercase"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          />
        </Field>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={setInvoicePrice.isPending}>
          {setInvoicePrice.isPending ? "Saving…" : "Save price"}
        </Button>
      </DialogFooter>
    </form>
  );
}
