import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

type TenantStatus = "trial" | "active" | "suspended";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  industry: string | null;
  twilioNumber: string | null;
  createdAt: string;
};

type TenantsResponse = { items: Tenant[]; total: number };

const statusStyles: Record<TenantStatus, string> = {
  trial: "bg-info-soft text-info",
  active: "bg-success-soft text-success",
  suspended: "bg-destructive-soft text-destructive",
};

export function TenantsPage() {
  const api = useApi();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api<TenantsResponse>("/admin/tenants?limit=50"),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TenantStatus }) =>
      api<Tenant>(`/admin/tenants/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (tenant) => {
      toast.success(`${tenant.name} is now ${tenant.status}`);
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: () => toast.error("Could not update the business"),
  });

  const columns: Column<Tenant>[] = [
    {
      key: "name",
      header: "Business",
      cell: (t) => (
        <div>
          <div className="font-medium">{t.name}</div>
          <div className="font-mono text-xs text-muted-foreground">
            {t.slug}
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (t) => (
        <Badge
          variant="outline"
          className={cn(
            "border-transparent capitalize",
            statusStyles[t.status],
          )}
        >
          {t.status}
        </Badge>
      ),
    },
    {
      key: "number",
      header: "Phone number",
      cell: (t) => (
        <span className="font-mono">{t.twilioNumber ?? "None"}</span>
      ),
    },
    {
      key: "created",
      header: "Created",
      cell: (t) => new Date(t.createdAt).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      className: "text-right",
      cell: (t) =>
        t.status === "suspended" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: t.id, status: "active" })}
          >
            Reactivate
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={setStatus.isPending}
            onClick={() => {
              // A confirm dialog is enough for V1; swap in a shadcn Dialog later
              if (
                window.confirm(
                  `Suspend ${t.name}? Its members lose access on their next request.`,
                )
              ) {
                setStatus.mutate({ id: t.id, status: "suspended" });
              }
            }}
          >
            Suspend
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Tenants"
        description={
          data
            ? `${data.total} businesses on the platform`
            : "Every business on the platform."
        }
      />

      {error ? (
        <EmptyState
          icon={Building2}
          title="Could not load businesses"
          description="Check that the backend is running and that you are signed in as a platform admin."
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
          getRowId={(t) => t.id}
          loading={isLoading}
          empty={
            <EmptyState
              icon={Building2}
              title="No businesses yet"
              description="Businesses appear here after someone creates one in the app."
            />
          }
        />
      )}
    </>
  );
}
