import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useApi } from "@/lib/api";
import {
  formatCredits,
  formatPeriod,
  type NeedsPricingItem,
} from "@/lib/billing";

export function BillingPage() {
  const api = useApi();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["needs-pricing"],
    queryFn: () =>
      api<{ items: NeedsPricingItem[] }>("/admin/billing/needs-pricing"),
  });

  const columns: Column<NeedsPricingItem>[] = [
    {
      key: "tenant",
      header: "Business",
      cell: (r) => <span className="font-medium">{r.tenantName}</span>,
    },
    {
      key: "period",
      header: "Month not invoiced",
      cell: (r) => formatPeriod(r.periodStart),
    },
    {
      key: "credits",
      header: "Credits used",
      className: "tabular-nums",
      cell: (r) => formatCredits(Number(r.creditsUsed)),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (r) => (
        <Button asChild size="sm" variant="outline">
          <Link to={`/tenants/${r.tenantId}/billing`}>Set price</Link>
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Billing"
        description="Postpaid businesses with usage that could not be invoiced because they have no price set. Set a price, then generate the invoice for the month."
      />

      {error ? (
        <EmptyState
          icon={Receipt}
          title="Could not load billing"
          description={error.message}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          getRowId={(r) => `${r.tenantId}-${r.periodStart}`}
          loading={isLoading}
          empty={
            <EmptyState
              icon={CheckCircle2}
              title="Nothing needs pricing"
              description="Every postpaid business with usage has a price, so all completed months can be invoiced."
            />
          }
        />
      )}
    </>
  );
}
